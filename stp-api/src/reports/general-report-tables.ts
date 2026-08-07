/**
 * Tablas del "Reporte general": la foto del negocio en un período.
 *
 * Vive en un archivo aparte de `report-tables.ts` (del que solo importa los
 * tipos y el helper de fechas) para no tocar lo que ya está en producción, pero
 * juega con las mismas reglas: es lógica PURA (sin base de datos, sin PDFKit,
 * sin ExcelJS) que convierte el reporte en tablas planas, de forma que el PDF y
 * el Excel digan lo mismo por construcción.
 *
 * La nómina es MANAGER+ incluso en lectura: cuando `payroll` es `null` la tabla
 * NO se genera (no aparece vacía ni en cero, que también sería información).
 */

import { fechaISO, type ExportDoc, type ExportTable } from './report-tables';

// ── Forma mínima del reporte ──────────────────────────────────────────────────
// Declarada aquí, igual que las demás, para poder probarla con objetos literales.

export interface GeneralFinance {
  income: number;
  incomeCount: number;
  expenses: number;
  expenseCount: number;
  profit: number;
  /** Utilidad / ingresos × 100. `null` si no hubo ingresos. */
  margin: number | null;
  /** Mismas cifras del período anterior, o `null` si no se calculó. */
  previous: { income: number; expenses: number; profit: number } | null;
  /** Variación porcentual contra el período anterior. `null` donde no hay base. */
  variation: { income: number | null; expenses: number | null; profit: number | null } | null;
}

export interface GeneralQuotes {
  emitted: { count: number; amount: number };
  approved: { count: number; amount: number };
  rejected: { count: number; amount: number };
  /** Aprobadas + rechazadas dentro del período (las que tuvieron respuesta). */
  decidedCount: number;
  /** Aprobadas / decididas × 100. `null` si nadie respondió. */
  conversionRate: number | null;
}

export interface GeneralPayroll {
  count: number;
  gross: number;
  net: number;
  /** Parte que ya viaja dentro de "Gastos" como mano de obra (no se suma dos veces). */
  imputedToExpenses: number;
}

export interface GeneralProjects {
  active: number;
  completedInPeriod: number;
  budgetCommitted: number;
  spent: number;
  /** Gastado / comprometido × 100. `null` sin presupuesto. */
  budgetUsed: number | null;
}

export interface GeneralReportShape {
  period: { from: string | Date; to: string | Date };
  previousPeriod: { from: string | Date; to: string | Date } | null;
  finance: GeneralFinance;
  quotes: GeneralQuotes;
  /** `null` para un USER: los sueldos son MANAGER+. */
  payroll: GeneralPayroll | null;
  projects: GeneralProjects;
  fichas: { total: number; enviadas: number; tasaEnvio: number };
}

// ── Constructor ───────────────────────────────────────────────────────────────

const porcentaje = (v: number | null | undefined): string =>
  v == null ? '—' : `${v}%`;

/** Tabla del resultado: con columna de variación solo si hay con qué comparar. */
function tablaResultado(f: GeneralFinance): ExportTable {
  const conVariacion = f.variation != null;
  const fila = (
    concepto: string,
    monto: number,
    variacion: number | null,
  ) => (conVariacion ? [concepto, monto, variacion] : [concepto, monto]);

  return {
    name: 'Resultado',
    title: 'Resultado del período',
    columns: conVariacion
      ? [
          { header: 'Concepto' },
          { header: 'Monto', type: 'money' as const },
          { header: 'Var. vs período anterior', type: 'percent' as const },
        ]
      : [{ header: 'Concepto' }, { header: 'Monto', type: 'money' as const }],
    rows: [
      fila('Ingresos cobrados', f.income, f.variation?.income ?? null),
      fila('Gastos', f.expenses, f.variation?.expenses ?? null),
      fila('Utilidad', f.profit, f.variation?.profit ?? null),
    ],
  };
}

export function buildGeneralDoc(r: GeneralReportShape): ExportDoc {
  const filtros = [
    { label: 'Desde', value: fechaISO(r.period.from) || '—' },
    { label: 'Hasta', value: fechaISO(r.period.to) || '—' },
  ];
  if (r.previousPeriod) {
    filtros.push({
      label: 'Comparado con',
      value: `${fechaISO(r.previousPeriod.from)} — ${fechaISO(r.previousPeriod.to)}`,
    });
  }

  const tables: ExportTable[] = [
    tablaResultado(r.finance),
    {
      name: 'Cotizaciones',
      title: 'Cotizaciones del período',
      columns: [
        { header: 'Concepto' },
        { header: 'Cantidad', type: 'int' },
        { header: 'Monto', type: 'money' },
      ],
      rows: [
        ['Emitidas', r.quotes.emitted.count, r.quotes.emitted.amount],
        ['Aprobadas', r.quotes.approved.count, r.quotes.approved.amount],
        ['Rechazadas', r.quotes.rejected.count, r.quotes.rejected.amount],
      ],
    },
  ];

  // Nómina: solo MANAGER+. Un USER no recibe el bloque y la tabla no existe.
  if (r.payroll) {
    tables.push({
      name: 'Nómina',
      title: 'Nómina pagada en el período',
      columns: [
        { header: 'Concepto' },
        { header: 'Cantidad', type: 'int' },
        { header: 'Monto', type: 'money' },
      ],
      rows: [
        ['Pagos de nómina (bruto)', r.payroll.count, r.payroll.gross],
        ['Neto entregado', null, r.payroll.net],
        ['Ya incluido en gastos (mano de obra)', null, r.payroll.imputedToExpenses],
      ],
      vacio: 'Sin nómina en el período',
    });
  }

  tables.push(
    {
      name: 'Proyectos',
      title: 'Proyectos',
      columns: [
        { header: 'Concepto' },
        { header: 'Cantidad', type: 'int' },
        { header: 'Monto', type: 'money' },
      ],
      rows: [
        ['Activos', r.projects.active, null],
        ['Terminados en el período', r.projects.completedInPeriod, null],
        ['Presupuesto comprometido (proyectos activos)', null, r.projects.budgetCommitted],
        ['Gastado en esos proyectos', null, r.projects.spent],
      ],
    },
    {
      name: 'Fichas',
      title: 'Fichas técnicas',
      columns: [{ header: 'Concepto' }, { header: 'Cantidad', type: 'int' }],
      rows: [
        ['Fichas creadas', r.fichas.total],
        ['Fichas enviadas', r.fichas.enviadas],
      ],
    },
    {
      name: 'Indicadores',
      title: 'Indicadores',
      columns: [{ header: 'Indicador' }, { header: 'Valor', type: 'text' }],
      rows: [
        ['Margen de utilidad', porcentaje(r.finance.margin)],
        ['Tasa de conversión de cotizaciones', porcentaje(r.quotes.conversionRate)],
        ['Tasa de envío de fichas', porcentaje(r.fichas.tasaEnvio)],
        ['Uso del presupuesto comprometido', porcentaje(r.projects.budgetUsed)],
      ],
    },
  );

  return {
    title: 'Reporte general del negocio',
    filename: 'reporte-general',
    filters: filtros,
    tables,
  };
}
