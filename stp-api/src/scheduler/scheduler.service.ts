import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Quote, QuoteStatus } from '../quotes/entities/quote.entity';
import { Task, TaskStatus } from '../tasks/entities/task.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { QuotesService } from '../quotes/quotes.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectRepository(Quote)
    private readonly quotesRepo: Repository<Quote>,
    @InjectRepository(Task)
    private readonly tasksRepo: Repository<Task>,
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepo: Repository<RefreshToken>,
    private readonly notifications: NotificationsService,
    private readonly quotesService: QuotesService,
  ) {}

  // Todos los días a las 3am — la tabla de refresh tokens nunca se depuraba: un
  // token revocado (rotado o usado) o expirado no vuelve a servir para nada
  // (`refresh()` solo acepta `revoked = false`), así que crecía sin límite.
  @Cron('0 3 * * *')
  async cleanupRefreshTokens() {
    try {
      const result = await this.refreshTokensRepo
        .createQueryBuilder()
        .delete()
        .where('revoked = :revoked OR "expiresAt" < :now', { revoked: true, now: new Date() })
        .execute();
      if (result.affected) {
        this.logger.log(`Refresh tokens cleanup: ${result.affected} eliminado(s)`);
      }
    } catch (err) {
      this.logger.error(`Refresh tokens cleanup failed: ${(err as Error).message}`);
    }
  }

  // Todos los días a las 9am — recordatorio al cliente de cotizaciones sin respuesta
  @Cron('0 9 * * *')
  async remindPendingQuotes() {
    try {
      await this.quotesService.remindPendingQuotes();
    } catch (err) {
      this.logger.error(`Quote reminders failed: ${(err as Error).message}`);
    }
  }

  // Todos los días a las 8am — cotizaciones por vencer en 3 días
  @Cron('0 8 * * *')
  async checkExpiringQuotes() {
    try {
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
    } catch (err) {
      this.logger.error(`Expiring-quotes check failed: ${(err as Error).message}`);
    }
  }

  // Todos los días a las 8am — tareas vencidas
  @Cron('0 8 * * *')
  async checkOverdueTasks() {
    try {
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
    } catch (err) {
      this.logger.error(`Overdue-tasks check failed: ${(err as Error).message}`);
    }
  }

  // Todos los lunes a las 9am — resumen de pagos pendientes
  @Cron('0 9 * * 1')
  async checkPendingPayments() {
    try {
      const pending = await this.paymentsRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.client', 'client')
        .where('p.status = :status', { status: PaymentStatus.PENDING })
        .orderBy('p.date', 'ASC')
        .getMany();

      if (!pending.length) return;

      const totalAmount = pending.reduce((sum, p) => sum + (p.amount ?? 0), 0);

      this.notifications.sendPendingPaymentsSummary({
        totalAmount,
        payments: pending.map((p) => ({
          clientName: p.client?.name ?? '—',
          amount: p.amount,
          description: p.description ?? '—',
          date: p.date,
        })),
      });

      this.logger.log(`Sent pending payments summary: ${pending.length} payment(s), total RD$ ${totalAmount}`);
    } catch (err) {
      this.logger.error(`Pending-payments check failed: ${(err as Error).message}`);
    }
  }
}
