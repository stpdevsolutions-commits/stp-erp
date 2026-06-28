import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
import { Project } from '../projects/entities/project.entity';
import { Task } from '../tasks/entities/task.entity';
import { Quote, QuoteStatus } from '../quotes/entities/quote.entity';
import { Expense } from '../expenses/entities/expense.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { Ficha, FichaStatus } from '../fichas/entities/ficha.entity';
import { Collaborator } from '../collaborators/entities/collaborator.entity';

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
    @InjectRepository(Ficha)
    private readonly fichasRepo: Repository<Ficha>,
    @InjectRepository(Collaborator)
    private readonly collaboratorsRepo: Repository<Collaborator>,
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

    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    const totalExpenses = parseFloat(expensesTotal.total);
    const totalPayments = parseFloat(paymentsTotal.total);
    const budget = project.budget ?? 0;

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

    if (!client) throw new NotFoundException(`Client ${clientId} not found`);

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

  async getIncomeReport(from: string, to: string) {
    const [paymentsByMethod, paymentsByProject, paymentsTotal, quotesApproved, pendingPayments] =
      await Promise.all([
        this.paymentsRepo
          .createQueryBuilder('p')
          .select('p.method', 'method')
          .addSelect('COUNT(*)', 'count')
          .addSelect('COALESCE(SUM(p.amount), 0)', 'total')
          .where('p.date >= :from AND p.date <= :to AND p.status = :status', {
            from, to, status: PaymentStatus.COMPLETED,
          })
          .groupBy('p.method')
          .getRawMany(),

        this.paymentsRepo
          .createQueryBuilder('p')
          .leftJoin('p.project', 'project')
          .leftJoin('p.client', 'client')
          .select('p.id', 'id')
          .addSelect('p.amount', 'amount')
          .addSelect('p.date', 'date')
          .addSelect('p.method', 'method')
          .addSelect('project.name', 'projectName')
          .addSelect('client.name', 'clientName')
          .where('p.date >= :from AND p.date <= :to AND p.status = :status', {
            from, to, status: PaymentStatus.COMPLETED,
          })
          .orderBy('p.date', 'DESC')
          .getRawMany(),

        this.paymentsRepo
          .createQueryBuilder('p')
          .select('COALESCE(SUM(p.amount), 0)', 'total')
          .addSelect('COUNT(*)', 'count')
          .where('p.date >= :from AND p.date <= :to AND p.status = :status', {
            from, to, status: PaymentStatus.COMPLETED,
          })
          .getRawOne(),

        this.quotesRepo
          .createQueryBuilder('q')
          .select('COALESCE(SUM(q.total), 0)', 'total')
          .addSelect('COUNT(*)', 'count')
          .where('q.status = :status', { status: QuoteStatus.APPROVED })
          .getRawOne(),

        this.paymentsRepo
          .createQueryBuilder('p')
          .select('COALESCE(SUM(p.amount), 0)', 'total')
          .addSelect('COUNT(*)', 'count')
          .where('p.status = :status', { status: PaymentStatus.PENDING })
          .getRawOne(),
      ]);

    return {
      period: { from, to },
      summary: {
        total: parseFloat(paymentsTotal.total),
        count: parseInt(paymentsTotal.count),
        quotesApproved: {
          total: parseFloat(quotesApproved.total),
          count: parseInt(quotesApproved.count),
        },
        pendingPayments: {
          total: parseFloat(pendingPayments.total),
          count: parseInt(pendingPayments.count),
        },
      },
      byMethod: paymentsByMethod.map((r) => ({
        method: r.method,
        count: parseInt(r.count),
        total: parseFloat(r.total),
      })),
      payments: paymentsByProject.map((r) => ({
        id: r.id,
        amount: parseFloat(r.amount),
        date: r.date,
        method: r.method,
        project: r.projectName,
        client: r.clientName,
      })),
    };
  }

  async getExpensesReport(from: string, to: string) {
    const [byCategory, byProject, total, topSuppliers] = await Promise.all([
      this.expensesRepo
        .createQueryBuilder('e')
        .select('e.category', 'category')
        .addSelect('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(e.amount), 0)', 'total')
        .where('e.date >= :from AND e.date <= :to', { from, to })
        .groupBy('e.category')
        .orderBy('SUM(e.amount)', 'DESC')
        .getRawMany(),

      this.expensesRepo
        .createQueryBuilder('e')
        .leftJoin('e.project', 'project')
        .select('project.id', 'projectId')
        .addSelect('project.name', 'projectName')
        .addSelect('COALESCE(SUM(e.amount), 0)', 'total')
        .addSelect('COUNT(*)', 'count')
        .where('e.date >= :from AND e.date <= :to', { from, to })
        .groupBy('project.id, project.name')
        .orderBy('SUM(e.amount)', 'DESC')
        .getRawMany(),

      this.expensesRepo
        .createQueryBuilder('e')
        .select('COALESCE(SUM(e.amount), 0)', 'total')
        .addSelect('COUNT(*)', 'count')
        .where('e.date >= :from AND e.date <= :to', { from, to })
        .getRawOne(),

      this.expensesRepo
        .createQueryBuilder('e')
        .leftJoin('e.supplier', 'supplier')
        .select('supplier.name', 'supplierName')
        .addSelect('COALESCE(SUM(e.amount), 0)', 'total')
        .addSelect('COUNT(*)', 'count')
        .where('e.date >= :from AND e.date <= :to AND supplier.id IS NOT NULL', { from, to })
        .groupBy('supplier.id, supplier.name')
        .orderBy('SUM(e.amount)', 'DESC')
        .limit(10)
        .getRawMany(),
    ]);

    return {
      period: { from, to },
      summary: {
        total: parseFloat(total.total),
        count: parseInt(total.count),
      },
      byCategory: byCategory.map((r) => ({
        category: r.category,
        count: parseInt(r.count),
        total: parseFloat(r.total),
      })),
      byProject: byProject.map((r) => ({
        projectId: r.projectId,
        project: r.projectName ?? 'Sin proyecto',
        count: parseInt(r.count),
        total: parseFloat(r.total),
      })),
      topSuppliers: topSuppliers.map((r) => ({
        supplier: r.supplierName,
        count: parseInt(r.count),
        total: parseFloat(r.total),
      })),
    };
  }

  async getFichasReport(from: string, to: string) {
    const [byType, byStatus, byTechnician, total] = await Promise.all([
      this.fichasRepo
        .createQueryBuilder('f')
        .select('f.type', 'type')
        .addSelect('COUNT(*)', 'count')
        .where('f.createdAt >= :from AND f.createdAt <= :to', { from, to: to + ' 23:59:59' })
        .groupBy('f.type')
        .getRawMany(),

      this.fichasRepo
        .createQueryBuilder('f')
        .select('f.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('f.createdAt >= :from AND f.createdAt <= :to', { from, to: to + ' 23:59:59' })
        .groupBy('f.status')
        .getRawMany(),

      this.fichasRepo
        .createQueryBuilder('f')
        .leftJoin('f.technician', 'user')
        .select('user.id', 'userId')
        .addSelect("CONCAT(user.firstName, ' ', user.lastName)", 'userName')
        .addSelect('COUNT(*)', 'count')
        .addSelect(
          `SUM(CASE WHEN f.status = '${FichaStatus.ENVIADA}' THEN 1 ELSE 0 END)`,
          'enviadas',
        )
        .where('f.createdAt >= :from AND f.createdAt <= :to', { from, to: to + ' 23:59:59' })
        .groupBy('user.id, user.firstName, user.lastName')
        .orderBy('COUNT(*)', 'DESC')
        .getRawMany(),

      this.fichasRepo
        .createQueryBuilder('f')
        .select('COUNT(*)', 'count')
        .addSelect(
          `SUM(CASE WHEN f.status = '${FichaStatus.ENVIADA}' THEN 1 ELSE 0 END)`,
          'enviadas',
        )
        .where('f.createdAt >= :from AND f.createdAt <= :to', { from, to: to + ' 23:59:59' })
        .getRawOne(),
    ]);

    return {
      period: { from, to },
      summary: {
        total: parseInt(total.count),
        enviadas: parseInt(total.enviadas),
        tasaEnvio:
          parseInt(total.count) > 0
            ? parseFloat(((parseInt(total.enviadas) / parseInt(total.count)) * 100).toFixed(1))
            : 0,
      },
      byType: byType.map((r) => ({ type: r.type, count: parseInt(r.count) })),
      byStatus: byStatus.map((r) => ({ status: r.status, count: parseInt(r.count) })),
      byTechnician: byTechnician.map((r) => ({
        userId: r.userId,
        name: r.userName,
        total: parseInt(r.count),
        enviadas: parseInt(r.enviadas),
      })),
    };
  }
}
