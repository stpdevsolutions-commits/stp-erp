import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { AccessControlService } from '../common/access/access-control.service';
import {
  hasUnrestrictedAccess,
  type AccessSubject,
} from '../common/access/access-policy';
import { Project, ProjectStatus } from '../projects/entities/project.entity';
import { Quote, QuoteStatus } from '../quotes/entities/quote.entity';
import { Expense } from '../expenses/entities/expense.entity';
import { PayrollEntry, PayrollStatus } from '../payroll/entities/payroll-entry.entity';
import { ReportsService } from './reports.service';
import type {
  GeneralPayroll,
  GeneralReportShape,
} from './general-report-tables';

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

const int = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? 0), 10);
  return Number.isFinite(n) ? n : 0;
};

const redondear = (n: number): number => parseFloat(n.toFixed(1));

/** Porcentaje que devuelve null (no NaN ni Infinity) cuando no hay base. */
const pct = (parte: number, total: number): number | null =>
  total > 0 ? redondear((parte / total) * 100) : null;

/**
 * Variación porcentual contra el período anterior.
 * Sin base (el período anterior fue 0) no se inventa un "+100%": va `null`.
 */
const variacion = (actual: number, anterior: number): number | null =>
  anterior !== 0 ? redondear(((actual - anterior) / Math.abs(anterior)) * 100) : null;

const DIA_MS = 86_400_000;

const aISO = (d: Date): string => d.toISOString().slice(0, 10);

const utc = (fecha: string): Date => new Date(`${fecha}T00:00:00Z`);

/** Último día del mes de `d`, en UTC. */
const finDeMes = (anio: number, mes: number): Date => new Date(Date.UTC(anio, mes + 1, 0));

/**
 * Período inmediatamente anterior con el que comparar.
 *
 * Si el rango son meses completos (un mes, un trimestre, un año) se compara
 * contra los MESES equivalentes anteriores, que es lo que espera quien pide
 * "julio contra junio" — restar 31 días a julio caería en el 31 de mayo y la
 * comparación sería falsa. Para un rango libre no queda otra que desplazar la
 * misma cantidad de días.
 */
export function periodoAnterior(from: string, to: string): { from: string; to: string } {
  const desde = utc(from);
  const hasta = utc(to);

  const empiezaMes = desde.getUTCDate() === 1;
  const terminaMes =
    hasta.getTime() ===
    finDeMes(hasta.getUTCFullYear(), hasta.getUTCMonth()).getTime();

  if (empiezaMes && terminaMes) {
    const meses =
      (hasta.getUTCFullYear() - desde.getUTCFullYear()) * 12 +
      (hasta.getUTCMonth() - desde.getUTCMonth()) +
      1;
    const inicio = new Date(
      Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth() - meses, 1),
    );
    return {
      from: aISO(inicio),
      to: aISO(finDeMes(desde.getUTCFullYear(), desde.getUTCMonth() - 1)),
    };
  }

  const dias = Math.round((hasta.getTime() - desde.getTime()) / DIA_MS) + 1;
  const finPrevio = desde.getTime() - DIA_MS;
  return {
    from: aISO(new Date(finPrevio - (dias - 1) * DIA_MS)),
    to: aISO(new Date(finPrevio)),
  };
}

/**
 * Reporte general del negocio en un período: ingresos, gastos, UTILIDAD,
 * cotizaciones, nómina, proyectos y fichas en una sola pantalla.
 *
 * No reescribe SQL: las agregaciones de ingresos, gastos y fichas son las que ya
 * usa `ReportsService` (mismos filtros, mismo ámbito por usuario), y aquí solo se
 * añade lo que no existía —cotizaciones y proyectos del período, nómina— y el
 * cruce que da la utilidad.
 *
 * Ámbito: igual que el resto de reportes, un USER ve únicamente sus proyectos y
 * clientes. La nómina es la excepción: son sueldos, se calcula solo para
 * MANAGER+ y para un USER el bloque viaja como `null` (no un 403 de la página).
 */
@Injectable()
export class GeneralReportService {
  constructor(
    @InjectRepository(Project)
    private readonly projectsRepo: Repository<Project>,
    @InjectRepository(Quote)
    private readonly quotesRepo: Repository<Quote>,
    @InjectRepository(Expense)
    private readonly expensesRepo: Repository<Expense>,
    @InjectRepository(PayrollEntry)
    private readonly payrollRepo: Repository<PayrollEntry>,
    private readonly reportsService: ReportsService,
    private readonly access: AccessControlService,
  ) {}

  /** quotes: `alias.projectId` / `alias.clientId`. */
  private scopeProjectClient<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    user?: AccessSubject,
  ): Promise<SelectQueryBuilder<T>> {
    return this.access.applyScope(qb, user, {
      projectExpr: `${qb.alias}.projectId`,
      clientExpr: `${qb.alias}.clientId`,
    });
  }

  /** projects: `alias.id` / `alias.clientId`. */
  private scopeProjects<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    user?: AccessSubject,
  ): Promise<SelectQueryBuilder<T>> {
    return this.access.applyScope(qb, user, {
      projectExpr: `${qb.alias}.id`,
      clientExpr: `${qb.alias}.clientId`,
    });
  }

  async getGeneralReport(
    from: string,
    to: string,
    user?: AccessSubject,
    opciones: { comparar?: boolean } = {},
  ): Promise<GeneralReportShape> {
    const comparar = opciones.comparar !== false;
    const previo = comparar ? periodoAnterior(from, to) : null;
    const verNomina = hasUnrestrictedAccess(user?.role);

    const [income, expenses, fichas, quotes, projects, payroll, anterior] = await Promise.all([
      this.reportsService.getIncomeReport(from, to, user),
      this.reportsService.getExpensesReport(from, to, user),
      this.reportsService.getFichasReport(from, to, user),
      this.cotizaciones(from, to, user),
      this.proyectos(from, to, user),
      verNomina ? this.nomina(from, to) : Promise.resolve(null),
      previo ? this.resultadoSimple(previo.from, previo.to, user) : Promise.resolve(null),
    ]);

    const ingresos = income.summary.total;
    const gastos = expenses.summary.total;
    const utilidad = ingresos - gastos;

    return {
      period: { from, to },
      previousPeriod: previo,
      finance: {
        income: ingresos,
        incomeCount: income.summary.count,
        expenses: gastos,
        expenseCount: expenses.summary.count,
        profit: utilidad,
        margin: pct(utilidad, ingresos),
        previous: anterior,
        variation: anterior
          ? {
              income: variacion(ingresos, anterior.income),
              expenses: variacion(gastos, anterior.expenses),
              profit: variacion(utilidad, anterior.profit),
            }
          : null,
      },
      quotes,
      payroll,
      projects,
      fichas: {
        total: fichas.summary.total,
        enviadas: fichas.summary.enviadas,
        tasaEnvio: fichas.summary.tasaEnvio,
      },
    };
  }

  /** Solo las tres cifras de cabecera: es lo que se compara con el período anterior. */
  private async resultadoSimple(
    from: string,
    to: string,
    user?: AccessSubject,
  ): Promise<{ income: number; expenses: number; profit: number }> {
    const [income, expenses] = await Promise.all([
      this.reportsService.getIncomeReport(from, to, user),
      this.reportsService.getExpensesReport(from, to, user),
    ]);
    return {
      income: income.summary.total,
      expenses: expenses.summary.total,
      profit: income.summary.total - expenses.summary.total,
    };
  }

  /**
   * Cotizaciones del período.
   *
   * "Emitidas" son las creadas dentro del período; "aprobadas"/"rechazadas", las
   * que RECIBIERON RESPUESTA dentro del período (`decidedAt`), que puede ser de
   * una cotización emitida antes. Por eso la tasa de conversión se calcula sobre
   * las decididas y no sobre las emitidas: comparar dos conjuntos distintos daría
   * porcentajes por encima del 100 %.
   */
  private async cotizaciones(from: string, to: string, user?: AccessSubject) {
    const hasta = `${to} 23:59:59`;

    const emitidasQb = this.quotesRepo
      .createQueryBuilder('q')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(q.total), 0)', 'total')
      .where('q.createdAt >= :from AND q.createdAt <= :to', { from, to: hasta });
    await this.scopeProjectClient(emitidasQb, user);

    const decididasQb = this.quotesRepo
      .createQueryBuilder('q')
      .select('q.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(q.total), 0)', 'total')
      .where('q.decidedAt >= :from AND q.decidedAt <= :to', { from, to: hasta })
      .andWhere('q.status IN (:...estados)', {
        estados: [QuoteStatus.APPROVED, QuoteStatus.REJECTED],
      })
      .groupBy('q.status');
    await this.scopeProjectClient(decididasQb, user);

    const [emitidas, decididas] = await Promise.all([
      emitidasQb.getRawOne<{ count: string; total: string }>(),
      decididasQb.getRawMany<{ status: string; count: string; total: string }>(),
    ]);

    const porEstado = (estado: QuoteStatus) => {
      const fila = decididas.find((r) => r.status === estado);
      return { count: int(fila?.count), amount: num(fila?.total) };
    };
    const approved = porEstado(QuoteStatus.APPROVED);
    const rejected = porEstado(QuoteStatus.REJECTED);
    const decidedCount = approved.count + rejected.count;

    return {
      emitted: { count: int(emitidas?.count), amount: num(emitidas?.total) },
      approved,
      rejected,
      decidedCount,
      conversionRate: pct(approved.count, decidedCount),
    };
  }

  /**
   * Proyectos: cuántos siguen activos hoy, cuántos se cerraron dentro del
   * período y, para los activos, cuánto presupuesto hay comprometido frente a
   * lo que ya se lleva gastado (histórico del proyecto, no solo del período: el
   * presupuesto tampoco es del período).
   */
  private async proyectos(from: string, to: string, user?: AccessSubject) {
    const activosQb = this.projectsRepo
      .createQueryBuilder('p')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(p.budget), 0)', 'budget')
      .where('p.status = :estado', { estado: ProjectStatus.ACTIVE });
    await this.scopeProjects(activosQb, user);

    const terminadosQb = this.projectsRepo
      .createQueryBuilder('p')
      .select('COUNT(*)', 'count')
      .where('p.status = :estado', { estado: ProjectStatus.COMPLETED })
      .andWhere('p.endDate >= :from AND p.endDate <= :to', { from, to });
    await this.scopeProjects(terminadosQb, user);

    const gastadoQb = this.expensesRepo
      .createQueryBuilder('e')
      .leftJoin('e.project', 'project')
      .select('COALESCE(SUM(e.amount), 0)', 'total')
      .where('project.status = :estado', { estado: ProjectStatus.ACTIVE });
    await this.access.applyScope(gastadoQb, user, {
      projectExpr: 'e.projectId',
      clientExpr: 'project.clientId',
    });

    const [activos, terminados, gastado] = await Promise.all([
      activosQb.getRawOne<{ count: string; budget: string }>(),
      terminadosQb.getRawOne<{ count: string }>(),
      gastadoQb.getRawOne<{ total: string }>(),
    ]);

    const budgetCommitted = num(activos?.budget);
    const spent = num(gastado?.total);

    return {
      active: int(activos?.count),
      completedInPeriod: int(terminados?.count),
      budgetCommitted,
      spent,
      budgetUsed: pct(spent, budgetCommitted),
    };
  }

  /**
   * Nómina pagada dentro del período (MANAGER+ únicamente).
   *
   * Se cuenta por fecha de pago, y si falta se usa el fin del período trabajado.
   * `imputedToExpenses` es la parte que YA está dentro de "Gastos" como mano de
   * obra: sin ese dato alguien restaría la nómina otra vez y la utilidad saldría
   * peor de lo que es.
   */
  private async nomina(from: string, to: string): Promise<GeneralPayroll> {
    const fecha = 'COALESCE(n.paymentDate, n.periodEnd)';
    const fila = await this.payrollRepo
      .createQueryBuilder('n')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(n.grossAmount), 0)', 'gross')
      .addSelect('COALESCE(SUM(n.netAmount), 0)', 'net')
      .addSelect(
        'COALESCE(SUM(CASE WHEN n.expenseId IS NOT NULL THEN n.grossAmount ELSE 0 END), 0)',
        'imputed',
      )
      .where('n.status = :estado', { estado: PayrollStatus.PAID })
      .andWhere(`${fecha} >= :from AND ${fecha} <= :to`, { from, to })
      .getRawOne<{ count: string; gross: string; net: string; imputed: string }>();

    return {
      count: int(fila?.count),
      gross: num(fila?.gross),
      net: num(fila?.net),
      imputedToExpenses: num(fila?.imputed),
    };
  }
}
