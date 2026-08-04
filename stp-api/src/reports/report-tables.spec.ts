import {
  buildClientDoc,
  buildExpensesDoc,
  buildFichasDoc,
  buildIncomeDoc,
  buildProjectDoc,
  type IncomeReportShape,
} from './report-tables';

/**
 * Las fechas son el punto delicado: dentro del servidor las columnas `date`
 * llegan como `Date`, aunque al salir por JSON parezcan strings. Suponer lo
 * segundo tumbó la exportación de ingresos en producción con
 * "p.date.slice is not a function", así que aquí se prueban ambas formas.
 */

function income(overrides: Partial<IncomeReportShape> = {}): IncomeReportShape {
  return {
    period: { from: '2026-07-01', to: '2026-07-31' },
    summary: {
      total: 125000,
      count: 2,
      quotesApproved: { total: 200000, count: 1 },
      pendingPayments: { total: 45000, count: 1 },
    },
    byMethod: [{ method: 'transfer', count: 2, total: 125000 }],
    payments: [
      { id: '1', amount: 75000, date: '2026-07-05', method: 'transfer', client: 'Cliente A' },
    ],
    ...overrides,
  };
}

/** Fila de la tabla "Detalle de cobros". */
const detalle = (doc: ReturnType<typeof buildIncomeDoc>) =>
  doc.tables.find((t) => t.name === 'Detalle')!;

describe('buildIncomeDoc', () => {
  it('acepta la fecha como string', () => {
    const doc = buildIncomeDoc(income());
    expect(detalle(doc).rows[0][0]).toBe('2026-07-05');
  });

  it('acepta la fecha como Date (lo que devuelve realmente el servidor)', () => {
    const doc = buildIncomeDoc(
      income({
        payments: [
          {
            id: '1',
            amount: 75000,
            date: new Date('2026-07-05T00:00:00Z'),
            method: 'transfer',
            client: 'Cliente A',
          },
        ],
      }),
    );
    expect(detalle(doc).rows[0][0]).toBe('2026-07-05');
  });

  it('acepta el período como Date sin romper los filtros', () => {
    const doc = buildIncomeDoc(
      income({
        period: { from: new Date('2026-07-01T00:00:00Z'), to: new Date('2026-07-31T00:00:00Z') },
      }),
    );
    expect(doc.filters).toEqual([
      { label: 'Desde', value: '2026-07-01' },
      { label: 'Hasta', value: '2026-07-31' },
    ]);
  });

  it('no revienta con una fecha inválida ni la inventa', () => {
    const doc = buildIncomeDoc(
      income({
        payments: [
          { id: '1', amount: 100, date: new Date('nada'), method: 'cash' },
        ],
      }),
    );
    expect(detalle(doc).rows[0][0]).toBe('');
  });

  it('traduce el método de pago y deja hueco visible sin cliente ni proyecto', () => {
    const doc = buildIncomeDoc(
      income({ payments: [{ id: '1', amount: 100, date: '2026-07-05', method: 'cash' }] }),
    );
    expect(detalle(doc).rows[0]).toEqual(['2026-07-05', '—', '—', 'Efectivo', 100]);
  });

  it('deja el método sin traducir si es uno que no conoce, en vez de perderlo', () => {
    const doc = buildIncomeDoc(income({ byMethod: [{ method: 'cripto', count: 1, total: 5 }] }));
    expect(doc.tables[1].rows[0][0]).toBe('cripto');
  });

  it('marca para totalizar solo las columnas numéricas del detalle', () => {
    const cols = detalle(buildIncomeDoc(income())).columns;
    expect(cols.filter((c) => c.total).map((c) => c.header)).toEqual(['Monto']);
  });
});

describe('el resto de reportes', () => {
  it('gastos: traduce categorías y tolera un proyecto sin nombre', () => {
    const doc = buildExpensesDoc({
      period: { from: '2026-07-01', to: '2026-07-31' },
      summary: { total: 500, count: 2 },
      byCategory: [{ category: 'materials', count: 1, total: 300 }],
      byProject: [{ project: '', count: 1, total: 200 }],
      topSuppliers: [],
    });
    expect(doc.tables[1].rows[0][0]).toBe('Materiales');
    expect(doc.tables[2].rows[0][0]).toBe('Sin proyecto');
    // Sin proveedores la tabla queda vacía, pero con su aviso: no se omite.
    expect(doc.tables[3].rows).toHaveLength(0);
    expect(doc.tables[3].vacio).toBeTruthy();
  });

  it('fichas: la tasa de envío sale con su símbolo', () => {
    const doc = buildFichasDoc({
      period: { from: '2026-07-01', to: '2026-07-31' },
      summary: { total: 10, enviadas: 7, tasaEnvio: 70 },
      byType: [{ type: 'electrico', count: 4 }],
      byStatus: [{ status: 'enviada', count: 7 }],
      byTechnician: [{ name: 'Ana', total: 5, enviadas: 4 }],
    });
    expect(doc.tables[0].rows[2]).toEqual(['Tasa de envío', '70%']);
    expect(doc.tables[1].rows[0][0]).toBe('Eléctrico');
  });

  it('proyecto: el nombre del archivo lleva el código', () => {
    const doc = buildProjectDoc({
      project: { code: 'PRJ-2026-003', name: 'Taller', status: 'active', budget: 1000 },
      tasks: { pending: 2, done: 1 },
      expenses: { total: 400, byCategory: { materials: 400 }, budgetUsed: 40 },
      payments: { total: 900 },
      balance: 500,
    });
    expect(doc.filename).toBe('reporte-proyecto-PRJ-2026-003');
    expect(doc.tables[0].rows).toEqual([
      ['Presupuesto', 1000],
      ['Gastos', 400],
      ['Cobros', 900],
      ['Balance', 500],
    ]);
    expect(doc.tables[2].rows[0][0]).toBe('Pendientes');
  });

  it('cliente: aguanta un cliente sin cotizaciones ni RNC', () => {
    const doc = buildClientDoc({
      client: { name: 'Cliente X' },
      quotes: {},
      approvedAmount: 0,
      totalPaid: 0,
      totalExpenses: 0,
      outstanding: 0,
    });
    expect(doc.filters[1]).toEqual({ label: 'RNC', value: '—' });
    expect(doc.tables[1].rows).toHaveLength(0);
  });
});
