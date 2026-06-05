import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
import { Project } from '../projects/entities/project.entity';
import { Task } from '../tasks/entities/task.entity';
import { Quote, QuoteStatus } from '../quotes/entities/quote.entity';
import { Expense } from '../expenses/entities/expense.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientsRepo: Repository<Client>,
    @InjectRepository(Project)
    private readonly projectsRepo: Repository<Project>,
    @InjectRepository(Task)
    private readonly tasksRepo: Repository<Task>,
    @InjectRepository(Quote)
    private readonly quotesRepo: Repository<Quote>,
    @InjectRepository(Expense)
    private readonly expensesRepo: Repository<Expense>,
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
  ) {}

  async getDashboard() {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0];
    const today = now.toISOString().split('T')[0];

    const [
      totalClients,
      projectsByStatus,
      quotesByStatus,
      expensesThisMonth,
      paymentsThisMonth,
      overdueTasksCount,
    ] = await Promise.all([
      this.clientsRepo.countBy({ isActive: true }),

      this.projectsRepo
        .createQueryBuilder('p')
        .select('p.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('p.status')
        .getRawMany(),

      this.quotesRepo
        .createQueryBuilder('q')
        .select('q.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(q.total), 0)', 'totalAmount')
        .groupBy('q.status')
        .getRawMany(),

      this.expensesRepo
        .createQueryBuilder('e')
        .select('COALESCE(SUM(e.amount), 0)', 'total')
        .where('e.date >= :from AND e.date <= :to', { from: firstOfMonth, to: today })
        .getRawOne(),

      this.paymentsRepo
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount), 0)', 'total')
        .where('p.date >= :from AND p.date <= :to AND p.status = :status', {
          from: firstOfMonth,
          to: today,
          status: PaymentStatus.COMPLETED,
        })
        .getRawOne(),

      this.tasksRepo
        .createQueryBuilder('t')
        .where('t.dueDate < :today AND t.status NOT IN (:...done)', {
          today,
          done: ['done', 'cancelled'],
        })
        .getCount(),
    ]);

    return {
      clients: { total: totalClients },
      projects: projectsByStatus.reduce(
        (acc, row) => ({ ...acc, [row.status]: parseInt(row.count) }),
        {} as Record<string, number>,
      ),
      quotes: quotesByStatus.reduce(
        (acc, row) => ({
          ...acc,
          [row.status]: { count: parseInt(row.count), amount: parseFloat(row.totalAmount) },
        }),
        {} as Record<string, { count: number; amount: number }>,
      ),
      expenses: { thisMonth: parseFloat(expensesThisMonth.total) },
      payments: { thisMonth: parseFloat(paymentsThisMonth.total) },
      tasks: { overdue: overdueTasksCount },
    };
  }

  async getProjectSummary(projectId: string) {
    const [project, tasksByStatus, expensesByCategory, expensesTotal, paymentsTotal] =
      await Promise.all([
        this.projectsRepo.findOne({
          where: { id: projectId },
          relations: { client: true, assignedTo: true },
        }),

        this.tasksRepo
          .createQueryBuilder('t')
          .select('t.status', 'status')
          .addSelect('COUNT(*)', 'count')
          .where('t.projectId = :projectId', { projectId })
          .groupBy('t.status')
          .getRawMany(),

        this.expensesRepo
          .createQueryBuilder('e')
          .select('e.category', 'category')
          .addSelect('COALESCE(SUM(e.amount), 0)', 'total')
          .where('e.projectId = :projectId', { projectId })
          .groupBy('e.category')
          .getRawMany(),

        this.expensesRepo
          .createQueryBuilder('e')
          .select('COALESCE(SUM(e.amount), 0)', 'total')
          .where('e.projectId = :projectId', { projectId })
          .getRawOne(),

        this.paymentsRepo
          .createQueryBuilder('p')
          .select('COALESCE(SUM(p.amount), 0)', 'total')
          .where('p.projectId = :projectId AND p.status = :status', {
            projectId,
            status: PaymentStatus.COMPLETED,
          })
          .getRawOne(),
      ]);

    const totalExpenses = parseFloat(expensesTotal.total);
    const totalPayments = parseFloat(paymentsTotal.total);
    const budget = project?.budget ?? 0;

    return {
      project,
      tasks: tasksByStatus.reduce(
        (acc, row) => ({ ...acc, [row.status]: parseInt(row.count) }),
        {} as Record<string, number>,
      ),
      expenses: {
        total: totalExpenses,
        byCategory: expensesByCategory.reduce(
          (acc, row) => ({ ...acc, [row.category]: parseFloat(row.total) }),
          {} as Record<string, number>,
        ),
        budgetUsed: budget > 0 ? parseFloat(((totalExpenses / budget) * 100).toFixed(1)) : null,
      },
      payments: { total: totalPayments },
      balance: totalPayments - totalExpenses,
    };
  }

  async getClientBalance(clientId: string) {
    const [client, quotesByStatus, paymentsTotal, expensesTotal] = await Promise.all([
      this.clientsRepo.findOne({ where: { id: clientId } }),

      this.quotesRepo
        .createQueryBuilder('q')
        .select('q.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(q.total), 0)', 'totalAmount')
        .where('q.clientId = :clientId', { clientId })
        .groupBy('q.status')
        .getRawMany(),

      this.paymentsRepo
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount), 0)', 'total')
        .where('p.clientId = :clientId AND p.status = :status', {
          clientId,
          status: PaymentStatus.COMPLETED,
        })
        .getRawOne(),

      this.expensesRepo
        .createQueryBuilder('e')
        .innerJoin('e.project', 'project')
        .select('COALESCE(SUM(e.amount), 0)', 'total')
        .where('project.clientId = :clientId', { clientId })
        .getRawOne(),
    ]);

    const approvedAmount = quotesByStatus
      .filter((r) => r.status === QuoteStatus.APPROVED)
      .reduce((sum, r) => sum + (parseFloat(r.totalAmount) || 0), 0);

    const totalPaid = parseFloat(paymentsTotal.total) || 0;
    const totalExpenses = parseFloat(expensesTotal.total) || 0;

    return {
      client,
      quotes: quotesByStatus.reduce(
        (acc, row) => ({
          ...acc,
          [row.status]: { count: parseInt(row.count), amount: parseFloat(row.totalAmount) || 0 },
        }),
        {} as Record<string, { count: number; amount: number }>,
      ),
      approvedAmount,
      totalPaid,
      totalExpenses,
      outstanding: approvedAmount - totalPaid,
    };
  }
}
