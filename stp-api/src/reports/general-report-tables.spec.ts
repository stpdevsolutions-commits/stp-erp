import { buildGeneralDoc, type GeneralReportShape } from './general-report-tables';

function general(overrides: Partial<GeneralReportShape> = {}): GeneralReportShape {
  return {
    period: { from: '2026-07-01', to: '2026-07-31' },
    previousPeriod: { from: '2026-05-31', to: '2026-06-30' },
    finance: {
      income: 200000,
      incomeCount: 4,
      expenses: 150000,
      expenseCount: 12,
      profit: 50000,
      margin: 25,
      previous: { income: 100000, expenses: 80000, profit: 20000 },
      variation: { income: 100, expenses: 87.5, profit: 150 },
    },
    quotes: {
      emitted: { count: 5, amount: 900000 },
      approved: { count: 2, amount: 400000 },
      rejected: { count: 1, amount: 100000 },
      decidedCount: 3,
      conversionRate: 66.7,
    },
    payroll: { count: 6, gross: 90000, net: 85000, imputedToExpenses: 70000 },
    projects: {
      active: 3,
      completedInPeriod: 1,
      budgetCommitted: 1000000,
      spent: 400000,
      budgetUsed: 40,
    },
    fichas: { total: 10, enviadas: 7, tasaEnvio: 70 },
    ...overrides,
  };
}

const tabla = (doc: ReturnType<typeof buildGeneralDoc>, name: string) =>
  doc.tables.find((t) => t.name === name);

describe('buildGeneralDoc', () => {
  it('la utilidad y el margen salen tal cual llegan, sin recalcular por su cuenta', () => {
    const doc = buildGeneralDoc(general());
    expect(tabla(doc, 'Resultado')!.rows).toEqual([
      ['Ingresos cobrados', 200000, 100],
      ['Gastos', 150000, 87.5],
      ['Utilidad', 50000, 150],
    ]);
    expect(tabla(doc, 'Indicadores')!.rows[0]).toEqual(['Margen de utilidad', '25%']);
  });

  it('sin comparativa no aparece la columna de variación', () => {
    const doc = buildGeneralDoc(
      general({
        previousPeriod: null,
        finance: { ...general().finance, previous: null, variation: null },
      }),
    );
    const resultado = tabla(doc, 'Resultado')!;
    expect(resultado.columns.map((c) => c.header)).toEqual(['Concepto', 'Monto']);
    expect(resultado.rows[2]).toEqual(['Utilidad', 50000]);
    expect(doc.filters.map((f) => f.label)).toEqual(['Desde', 'Hasta']);
  });

  it('el período anterior aparece entre los filtros del documento', () => {
    expect(buildGeneralDoc(general()).filters).toContainEqual({
      label: 'Comparado con',
      value: '2026-05-31 — 2026-06-30',
    });
  });

  // ── RBAC ────────────────────────────────────────────────────────────────────
  it('un USER (payroll = null) no recibe NINGUNA cifra de nómina', () => {
    const doc = buildGeneralDoc(general({ payroll: null }));
    expect(tabla(doc, 'Nómina')).toBeUndefined();
    // Ni la tabla, ni un cero, ni el texto: los sueldos no se filtran por descuido.
    expect(JSON.stringify(doc)).not.toMatch(/n[oó]mina/i);
    const celdas = doc.tables.flatMap((t) => t.rows.flat());
    expect(celdas).not.toContain(90000);
    expect(celdas).not.toContain(85000);
    expect(celdas).not.toContain(70000);
  });

  it('un MANAGER sí ve la nómina, con la parte ya imputada a gastos', () => {
    const nomina = tabla(buildGeneralDoc(general()), 'Nómina')!;
    expect(nomina.rows).toEqual([
      ['Pagos de nómina (bruto)', 6, 90000],
      ['Neto entregado', null, 85000],
      ['Ya incluido en gastos (mano de obra)', null, 70000],
    ]);
  });

  it('los porcentajes sin base salen como raya, no como 0 %', () => {
    const doc = buildGeneralDoc(
      general({
        finance: { ...general().finance, income: 0, profit: -1000, margin: null },
        quotes: { ...general().quotes, decidedCount: 0, conversionRate: null },
        projects: { ...general().projects, budgetCommitted: 0, budgetUsed: null },
      }),
    );
    const indicadores = tabla(doc, 'Indicadores')!;
    expect(indicadores.rows[0]).toEqual(['Margen de utilidad', '—']);
    expect(indicadores.rows[1]).toEqual(['Tasa de conversión de cotizaciones', '—']);
    expect(indicadores.rows[3]).toEqual(['Uso del presupuesto comprometido', '—']);
  });

  it('acepta el período como Date, que es como llega dentro del servidor', () => {
    const doc = buildGeneralDoc(
      general({
        period: { from: new Date('2026-07-01T00:00:00Z'), to: new Date('2026-07-31T00:00:00Z') },
        previousPeriod: null,
      }),
    );
    expect(doc.filters).toEqual([
      { label: 'Desde', value: '2026-07-01' },
      { label: 'Hasta', value: '2026-07-31' },
    ]);
  });

  it('las pestañas del Excel caben en los 31 caracteres que admite', () => {
    for (const t of buildGeneralDoc(general()).tables) {
      expect(t.name.length).toBeLessThanOrEqual(31);
    }
  });
});
