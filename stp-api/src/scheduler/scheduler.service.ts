import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Quote, QuoteStatus } from '../quotes/entities/quote.entity';
import { Task, TaskStatus } from '../tasks/entities/task.entity';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectRepository(Quote)
    private readonly quotesRepo: Repository<Quote>,
    @InjectRepository(Task)
    private readonly tasksRepo: Repository<Task>,
    private readonly notifications: NotificationsService,
  ) {}

  // Todos los días a las 8am
  @Cron('0 8 * * *')
  async checkExpiringQuotes() {
    const in3Days = new Date();
    in3Days.setDate(in3Days.getDate() + 3);
    const dateStr = in3Days.toISOString().slice(0, 10);

    const expiring = await this.quotesRepo
      .createQueryBuilder('q')
      .leftJoinAndSelect('q.client', 'client')
      .where('q.status IN (:...statuses)', { statuses: [QuoteStatus.DRAFT, QuoteStatus.SENT] })
      .andWhere('q.validUntil = :date', { date: dateStr })
      .getMany();

    for (const quote of expiring) {
      this.notifications.sendQuoteExpiringSoon({
        quoteNumber: quote.number,
        quoteTitle: quote.title,
        clientName: quote.client?.name ?? 'Cliente',
        validUntil: quote.validUntil,
        total: quote.total,
      });
    }

    if (expiring.length) {
      this.logger.log(`Sent expiring-soon alerts for ${expiring.length} quote(s)`);
    }
  }

  // Todos los días a las 8am
  @Cron('0 8 * * *')
  async checkOverdueTasks() {
    const today = new Date().toISOString().slice(0, 10);

    const overdue = await this.tasksRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.project', 'project')
      .leftJoinAndSelect('t.assignedTo', 'assignedTo')
      .where('t.status NOT IN (:...statuses)', {
        statuses: [TaskStatus.DONE, TaskStatus.CANCELLED],
      })
      .andWhere('t.dueDate < :today', { today })
      .getMany();

    if (!overdue.length) return;

    this.notifications.sendOverdueTasksSummary({
      tasks: overdue.map((t) => ({
        title: t.title,
        projectName: t.project?.name ?? '—',
        assignedTo: t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}` : '—',
        dueDate: t.dueDate,
      })),
    });

    this.logger.log(`Sent overdue tasks summary: ${overdue.length} task(s)`);
  }
}
