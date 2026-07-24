import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
import { Project, ProjectStatus, ProjectType } from '../projects/entities/project.entity';
import { Task } from '../tasks/entities/task.entity';
import { Quote, QuoteStatus } from '../quotes/entities/quote.entity';
import { Expense } from '../expenses/entities/expense.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { Ficha, FichaStatus } from '../fichas/entities/ficha.entity';
import { Collaborator } from '../collaborators/entities/collaborator.entity';

/** Etiquetas de mes en español, índice 0 = enero. */
const MONTH_LABELS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

/** Cubetas de antigüedad para cotizaciones enviadas sin respuesta. */
const AGING_BUCKETS = [
  { key: '0-3', label: '0–3 días', min: 0, max: 3 },
  { key: '4-7', label: '4–7 días', min: 4, max: 7 },
  { key: '8-15', label: '8–15 días', min: 8, max: 15 },
  { key: '15+', label: 'Más de 15 días', min: 16, max: Number.POSITIVE_INFINITY },
];

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

const int = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? 0), 10);
  return Number.isFinite(n) ? n : 0;
};

/** Divide devolviendo null (no NaN ni Infinity) cuando no hay base. */
const pct = (part: number, whole: number): number | null =>
  whole > 0 ? parseFloat(((part / whole) * 100).toFixed(1)) : null;

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

  /**
   * Datos agregados por periodo para las gráficas del dashboard.
   *
   * Devuelve SIEMPRE la estructura completa (series con ceros, listas vacías)
   * más un flag `hasData` por bloque, para que el frontend pueda pintar un
   * estado vacío explícito en lugar de un lienzo en blanco o ejes con NaN.
   *
   * @param months ventana de meses hacia atrás (incluye el mes actual)
   */
  async getAnalytics(months = 6) {
    const span = Math.min(Math.max(Math.trunc(months) || 6, 1), 24);
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Eje temporal completo: si no hay pagos/gastos en un mes, el mes sigue
    // existiendo con 0 (nunca un hueco que rompa la escala).
    const axis: { month: string; label: string; year: number }[] = [];
    for (let i = span - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      axis.push({
        month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
        label: MONTH_LABELS[d.getUTCMonth()],
        year: d.getUTCFullYear(),
      });
    }
    const windowStart = `${axis[0].month}-01`;

    const [
      incomeRows,
      expenseRows,
      quotesRows,
      quotesResponse,
      pendingQuotes,
      projectRows,
      expensesByCategory,
      approvedQuotes,
      collectedPayments,
      pendingPaymentsRow,
    ] = await Promise.all([
      // Ingresos por mes (pagos completados)
      this.paymentsRepo
        .createQueryBuilder('p')
        .select("to_char(p.date, 'YYYY-MM')", 'month')
        .addSelect('COALESCE(SUM(p.amount), 0)', 'total')
        .where('p.date >= :from AND p.status = :status', {
          from: windowStart,
          status: PaymentStatus.COMPLETED,
        })
        .groupBy("to_char(p.date, 'YYYY-MM')")
        .getRawMany(),

      // Gastos por mes
      this.expensesRepo
        .createQueryBuilder('e')
        .select("to_char(e.date, 'YYYY-MM')", 'month')
        .addSelect('COALESCE(SUM(e.amount), 0)', 'total')
        .where('e.date >= :from', { from: windowStart })
        .groupBy("to_char(e.date, 'YYYY-MM')")
        .getRawMany(),

      // Cotizaciones por estado (todas, para el embudo)
      this.quotesRepo
        .createQueryBuilder('q')
        .select('q.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(q.total), 0)', 'total')
        .groupBy('q.status')
        .getRawMany(),

      // Tiempo medio de respuesta del cliente (solo donde hay ambas marcas)
      this.quotesRepo
        .createQueryBuilder('q')
        .select(
          'AVG(EXTRACT(EPOCH FROM (q.decidedAt - q.sentAt)) / 86400)',
          'avgDays',
        )
        .addSelect('COUNT(*)', 'count')
        .where('q.sentAt IS NOT NULL AND q.decidedAt IS NOT NULL')
        .getRawOne(),

      // Cotizaciones enviadas esperando respuesta, con su antigüedad en días
      this.quotesRepo
        .createQueryBuilder('q')
        .leftJoin('q.client', 'client')
        .select('q.id', 'id')
        .addSelect('q.number', 'number')
        .addSelect('q.total', 'total')
        .addSelect('q.reminderCount', 'reminderCount')
        .addSelect('client.name', 'clientName')
        .addSelect(
          'GREATEST(0, DATE_PART(\'day\', now() - COALESCE(q.sentAt, q.createdAt)))',
          'ageDays',
        )
        .where('q.status = :status', { status: QuoteStatus.SENT })
        .orderBy('COALESCE(q.sentAt, q.createdAt)', 'ASC')
        .getRawMany(),

      // Proyectos: tabla cruzada tipo × estado
      this.projectsRepo
        .createQueryBuilder('p')
        .select('p.type', 'type')
        .addSelect('p.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('p.type')
        .addGroupBy('p.status')
        .getRawMany(),

      // Gastos por categoría dentro de la ventana
      this.expensesRepo
        .createQueryBuilder('e')
        .select('e.category', 'category')
        .addSelect('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(e.amount), 0)', 'total')
        .where('e.date >= :from', { from: windowStart })
        .groupBy('e.category')
        .orderBy('SUM(e.amount)', 'DESC')
        .getRawMany(),

      // Cartera: monto aprobado en cotizaciones
      this.quotesRepo
        .createQueryBuilder('q')
        .select('COALESCE(SUM(q.total), 0)', 'total')
        .addSelect('COUNT(*)', 'count')
        .where('q.status = :status', { status: QuoteStatus.APPROVED })
        .getRawOne(),

      // Cartera: cobrado (pagos completados, histórico)
      this.paymentsRepo
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount), 0)', 'total')
        .addSelect('COUNT(*)', 'count')
        .where('p.status = :status', { status: PaymentStatus.COMPLETED })
        .getRawOne(),

      // Cartera: pagos registrados pero pendientes de confirmar
      this.paymentsRepo
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount), 0)', 'total')
        .addSelect('COUNT(*)', 'count')
        .where('p.status = :status', { status: PaymentStatus.PENDING })
        .getRawOne(),
    ]);

    // ── Ingresos vs gastos ────────────────────────────────────────────────
    const incomeByMonth = new Map<string, number>(
      incomeRows.map((r) => [String(r.month), num(r.total)]),
    );
    const expenseByMonth = new Map<string, number>(
      expenseRows.map((r) => [String(r.month), num(r.total)]),
    );
    const cashflowMonths = axis.map((a) => {
      const income = incomeByMonth.get(a.month) ?? 0;
      const expenses = expenseByMonth.get(a.month) ?? 0;
      return { ...a, income, expenses, balance: income - expenses };
    });
    const cashflowTotals = cashflowMonths.reduce(
      (acc, m) => ({ income: acc.income + m.income, expenses: acc.expenses + m.expenses }),
      { income: 0, expenses: 0 },
    );

    // ── Embudo de cotizaciones ────────────────────────────────────────────
    const byStatus = new Map<string, { count: number; total: number }>(
      quotesRows.map((r) => [String(r.status), { count: int(r.count), total: num(r.total) }]),
    );
    const g = (s: QuoteStatus) => byStatus.get(s) ?? { count: 0, total: 0 };
    const draft = g(QuoteStatus.DRAFT);
    const sent = g(QuoteStatus.SENT);
    const approved = g(QuoteStatus.APPROVED);
    const rejected = g(QuoteStatus.REJECTED);
    const expired = g(QuoteStatus.EXPIRED);

    // "Salió al cliente" = todo lo que ya no es borrador.
    const outCount = sent.count + approved.count + rejected.count + expired.count;
    const outTotal = sent.total + approved.total + rejected.total + expired.total;
    const decidedCount = approved.count + rejected.count;
    const decidedTotal = approved.total + rejected.total;
    const createdCount = outCount + draft.count;
    const createdTotal = outTotal + draft.total;

    const funnel = {
      stages: [
        { key: 'created', label: 'Creadas', count: createdCount, amount: createdTotal },
        { key: 'sent', label: 'Enviadas al cliente', count: outCount, amount: outTotal },
        { key: 'decided', label: 'Con respuesta', count: decidedCount, amount: decidedTotal },
        { key: 'approved', label: 'Aprobadas', count: approved.count, amount: approved.total },
      ],
      breakdown: {
        draft: draft,
        sent: sent,
        approved: approved,
        rejected: rejected,
        expired: expired,
      },
      conversion: {
        sentToApproved: pct(approved.count, outCount),
        createdToApproved: pct(approved.count, createdCount),
        decidedToApproved: pct(approved.count, decidedCount),
      },
      response: {
        avgDays:
          int(quotesResponse?.count) > 0 && quotesResponse?.avgDays != null
            ? parseFloat(num(quotesResponse.avgDays).toFixed(1))
            : null,
        sampleSize: int(quotesResponse?.count),
      },
      hasData: createdCount > 0,
    };

    // ── Antigüedad de cotizaciones sin respuesta ──────────────────────────
    const agingItems = pendingQuotes.map((r) => ({
      id: String(r.id),
      number: String(r.number),
      client: r.clientName ? String(r.clientName) : null,
      amount: num(r.total),
      reminders: int(r.reminderCount),
      ageDays: int(r.ageDays),
    }));
    const agingBuckets = AGING_BUCKETS.map((b) => {
      const items = agingItems.filter((q) => q.ageDays >= b.min && q.ageDays <= b.max);
      return {
        key: b.key,
        label: b.label,
        count: items.length,
        amount: items.reduce((s, q) => s + q.amount, 0),
      };
    });
    const aging = {
      buckets: agingBuckets,
      total: agingItems.length,
      amount: agingItems.reduce((s, q) => s + q.amount, 0),
      oldest: agingItems.length > 0 ? agingItems[0] : null,
      stale: agingItems.filter((q) => q.ageDays > 7).length,
      hasData: agingItems.length > 0,
    };

    // ── Proyectos: tipo × estado ──────────────────────────────────────────
    const statusOrder = [
      ProjectStatus.DRAFT,
      ProjectStatus.ACTIVE,
      ProjectStatus.ON_HOLD,
      ProjectStatus.COMPLETED,
      ProjectStatus.CANCELLED,
    ];
    const typeOrder = [
      ProjectType.ELECTRICAL,
      ProjectType.MECHANICAL,
      ProjectType.CONSTRUCTION,
      ProjectType.MAINTENANCE,
      ProjectType.OTHER,
    ];
    const cross = new Map<string, number>(
      projectRows.map((r) => [`${r.type}|${r.status}`, int(r.count)]),
    );
    const projectsByType = typeOrder
      .map((type) => {
        const byStatusCounts = statusOrder.map((status) => ({
          status,
          count: cross.get(`${type}|${status}`) ?? 0,
        }));
        return {
          type,
          total: byStatusCounts.reduce((s, x) => s + x.count, 0),
          byStatus: byStatusCounts,
        };
      })
      .filter((t) => t.total > 0);
    const projectsTotal = projectsByType.reduce((s, t) => s + t.total, 0);
    const projectsByStatus = statusOrder.map((status) => ({
      status,
      count: projectsByType.reduce(
        (s, t) => s + (t.byStatus.find((x) => x.status === status)?.count ?? 0),
        0,
      ),
    }));

    // ── Gastos por categoría ──────────────────────────────────────────────
    const categories = expensesByCategory.map((r) => ({
      category: String(r.category),
      count: int(r.count),
      total: num(r.total),
    }));

    // ── Cartera por cobrar ────────────────────────────────────────────────
    const approvedAmount = num(approvedQuotes?.total);
    const collectedAmount = num(collectedPayments?.total);
    const receivables = {
      approved: approvedAmount,
      approvedCount: int(approvedQuotes?.count),
      collected: collectedAmount,
      collectedCount: int(collectedPayments?.count),
      pending: Math.max(0, approvedAmount - collectedAmount),
      collectedPct: pct(Math.min(collectedAmount, approvedAmount), approvedAmount),
      unconfirmed: num(pendingPaymentsRow?.total),
      unconfirmedCount: int(pendingPaymentsRow?.count),
      hasData: approvedAmount > 0 || collectedAmount > 0,
    };

    return {
      generatedAt: today,
      window: { months: span, from: windowStart, to: today },
      cashflow: {
        months: cashflowMonths,
        totals: {
          ...cashflowTotals,
          balance: cashflowTotals.income - cashflowTotals.expenses,
        },
        hasData: cashflowTotals.income > 0 || cashflowTotals.expenses > 0,
      },
      quotes: funnel,
      quotesAging: aging,
      projects: {
        byType: projectsByType,
        byStatus: projectsByStatus,
        total: projectsTotal,
        hasData: projectsTotal > 0,
      },
      expenses: {
        byCategory: categories,
        total: categories.reduce((s, c) => s + c.total, 0),
        hasData: categories.length > 0,
      },
      receivables,
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
