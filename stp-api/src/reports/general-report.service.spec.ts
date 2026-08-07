import { GeneralReportService, periodoAnterior } from './general-report.service';
import { UserRole } from '../users/entities/user.entity';

/**
 * El servicio se prueba con repositorios falsos (nada de base de datos): lo que
 * interesa aquí es el cruce que produce la utilidad y, sobre todo, que la nómina
 * NO se calcule ni se devuelva para un USER — son sueldos.
 */

type Raw = Record<string, unknown>;

/** Query builder de mentira: encadena todo y devuelve la fila que se le dé. */
function fakeQb(raw: Raw | Raw[]) {
  const qb: Record<string, unknown> = { alias: 'x' };
  for (const metodo of [
    'select',
    'addSelect',
    'where',
    'andWhere',
    'groupBy',
    'addGroupBy',
    'leftJoin',
    'innerJoin',
    'orderBy',
    'limit',
  ]) {
    qb[metodo] = () => qb;
  }
  qb.getRawOne = () => Promise.resolve(Array.isArray(raw) ? raw[0] : raw);
  qb.getRawMany = () => Promise.resolve(Array.isArray(raw) ? raw : [raw]);
  return qb;
}

/** Repositorio que va sirviendo, en orden, las filas de cada consulta. */
function fakeRepo(...resultados: (Raw | Raw[])[]) {
  const cola = [...resultados];
  return {
    createQueryBuilder: () => fakeQb(cola.shift() ?? {}),
  };
}

const reportsServiceFake = () => ({
  getIncomeReport: jest.fn(() =>
    Promise.resolve({
      period: { from: '', to: '' },
      summary: {
        total: 200000,
        count: 4,
        quotesApproved: { total: 0, count: 0 },
        pendingPayments: { total: 0, count: 0 },
      },
      byMethod: [],
      payments: [],
    }),
  ),
  getExpensesReport: jest.fn(() =>
    Promise.resolve({
      period: { from: '', to: '' },
      summary: { total: 150000, count: 12 },
      byCategory: [],
      byProject: [],
      topSuppliers: [],
    }),
  ),
  getFichasReport: jest.fn(() =>
    Promise.resolve({
      period: { from: '', to: '' },
      summary: { total: 10, enviadas: 7, tasaEnvio: 70 },
      byType: [],
      byStatus: [],
      byTechnician: [],
    }),
  ),
});

interface Opciones {
  /** Si es false, consultar la nómina revienta el test. */
  payrollDisponible?: boolean;
}

function construir(opciones: Opciones = {}) {
  const reports = reportsServiceFake();

  const payrollRepo = {
    createQueryBuilder: () => {
      if (opciones.payrollDisponible === false) {
        throw new Error('la nómina no debe consultarse para este usuario');
      }
      return fakeQb({ count: '6', gross: '90000', net: '85000', imputed: '70000' });
    },
  };

  const service = new GeneralReportService(
    // projects: primero los activos, después los terminados en el período
    fakeRepo({ count: '3', budget: '1000000' }, { count: '1' }) as never,
    // quotes: emitidas y luego las decididas agrupadas por estado
    fakeRepo({ count: '5', total: '900000' }, [
      { status: 'approved', count: '2', total: '400000' },
      { status: 'rejected', count: '1', total: '100000' },
    ]) as never,
    fakeRepo({ total: '400000' }) as never,
    payrollRepo as never,
    reports as never,
    { applyScope: (qb: unknown) => Promise.resolve(qb) } as never,
  );

  return { service, reports };
}

describe('GeneralReportService', () => {
  it('la utilidad es ingresos − gastos y el margen se calcula sobre los ingresos', async () => {
    const { service } = construir();
    const r = await service.getGeneralReport('2026-07-01', '2026-07-31', {
      id: 'u1',
      role: UserRole.MANAGER,
    });

    expect(r.finance.income).toBe(200000);
    expect(r.finance.expenses).toBe(150000);
    expect(r.finance.profit).toBe(50000);
    expect(r.finance.margin).toBe(25);
  });

  it('la tasa de conversión se mide sobre las cotizaciones decididas', async () => {
    const { service } = construir();
    const r = await service.getGeneralReport('2026-07-01', '2026-07-31', {
      id: 'u1',
      role: UserRole.ADMIN,
    });

    expect(r.quotes.emitted).toEqual({ count: 5, amount: 900000 });
    expect(r.quotes.decidedCount).toBe(3);
    expect(r.quotes.conversionRate).toBe(66.7);
  });

  // ── RBAC: la nómina es MANAGER+ incluso en lectura ──────────────────────────
  it('un USER no recibe nómina, y la tabla de nómina ni siquiera se consulta', async () => {
    const { service } = construir({ payrollDisponible: false });
    const r = await service.getGeneralReport('2026-07-01', '2026-07-31', {
      id: 'u1',
      role: UserRole.USER,
    });

    expect(r.payroll).toBeNull();
    // El resto del reporte sí llega: un USER ve una versión acotada, no un 403.
    expect(r.finance.profit).toBe(50000);
    expect(r.projects.active).toBe(3);
  });

  it('un MANAGER sí recibe la nómina', async () => {
    const { service } = construir();
    const r = await service.getGeneralReport('2026-07-01', '2026-07-31', {
      id: 'u1',
      role: UserRole.MANAGER,
    });

    expect(r.payroll).toEqual({
      count: 6,
      gross: 90000,
      net: 85000,
      imputedToExpenses: 70000,
    });
  });

  it('sin sujeto tampoco hay nómina (llamadas internas sin usuario)', async () => {
    const { service } = construir({ payrollDisponible: false });
    const r = await service.getGeneralReport('2026-07-01', '2026-07-31', undefined);
    expect(r.payroll).toBeNull();
  });

  it('la comparativa con el período anterior repite ingresos y gastos, y se puede apagar', async () => {
    const conComparativa = construir();
    const r1 = await conComparativa.service.getGeneralReport('2026-07-01', '2026-07-31', {
      id: 'u1',
      role: UserRole.MANAGER,
    });
    expect(r1.previousPeriod).toEqual({ from: '2026-06-01', to: '2026-06-30' });
    // El fake devuelve las mismas cifras en los dos períodos: variación 0 %.
    expect(conComparativa.reports.getIncomeReport).toHaveBeenCalledTimes(2);
    expect(r1.finance.variation).toEqual({ income: 0, expenses: 0, profit: 0 });

    const sinComparativa = construir();
    const r2 = await sinComparativa.service.getGeneralReport(
      '2026-07-01',
      '2026-07-31',
      { id: 'u1', role: UserRole.MANAGER },
      { comparar: false },
    );
    expect(r2.previousPeriod).toBeNull();
    expect(r2.finance.variation).toBeNull();
    expect(sinComparativa.reports.getIncomeReport).toHaveBeenCalledTimes(1);
  });
});

describe('periodoAnterior', () => {
  it('un mes se compara con los mismos días inmediatamente anteriores', () => {
    expect(periodoAnterior('2026-07-01', '2026-07-31')).toEqual({
      from: '2026-06-01',
      to: '2026-06-30',
    });
  });

  it('un trimestre completo', () => {
    expect(periodoAnterior('2026-04-01', '2026-06-30')).toEqual({
      from: '2026-01-01',
      to: '2026-03-31',
    });
  });

  it('un rango de un solo día', () => {
    expect(periodoAnterior('2026-07-15', '2026-07-15')).toEqual({
      from: '2026-07-14',
      to: '2026-07-14',
    });
  });

  it('cruza el cambio de año sin perderse', () => {
    expect(periodoAnterior('2026-01-01', '2026-01-31')).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });

  it('un año completo se compara con el año anterior', () => {
    expect(periodoAnterior('2026-01-01', '2026-12-31')).toEqual({
      from: '2025-01-01',
      to: '2025-12-31',
    });
  });

  it('febrero contra enero: meses completos, no 28 días hacia atrás', () => {
    expect(periodoAnterior('2026-02-01', '2026-02-28')).toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
    });
  });

  it('un rango libre sí se desplaza por días', () => {
    expect(periodoAnterior('2026-07-10', '2026-07-19')).toEqual({
      from: '2026-06-30',
      to: '2026-07-09',
    });
  });
});
