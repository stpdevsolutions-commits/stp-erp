/**
 * Convierte cada reporte en tablas planas, que es lo único que necesitan tanto el
 * Excel como el PDF.
 *
 * Está separado de los dos generadores a propósito: así el contenido del reporte
 * —qué columnas, qué filas, qué se totaliza— se decide UNA vez y los dos formatos
 * salen iguales por construcción. Si esto viviera en cada generador, el Excel y el
 * PDF empezarían a divergir en cuanto alguien tocara uno de los dos.
 *
 * Es lógica pura: sin base de datos, sin PDFKit, sin ExcelJS.
 */

export type ExportCellType = 'text' | 'money' | 'int' | 'percent' | 'date';

export interface ExportColumn {
  header: string;
  type?: ExportCellType;
  /** Si es true, se suma en la fila de totales. */
  total?: boolean;
}

export type ExportCell = string | number | null;

/**
 * Una foto para incrustar en el PDF.
 *
 * `path` es una ruta ABSOLUTA en disco y la rellena el servicio justo antes de
 * exportar — nunca viaja en el JSON de la API, que solo expone nombre y fecha.
 * Por eso `report-tables.ts` sigue siendo lógica pura: aquí solo se declara la
 * forma, quien toca el disco es el exportador.
 */
export interface ExportImage {
  path: string;
  /** Pie de foto (el nombre del archivo). */
  caption?: string;
  /** Segunda línea del pie, más tenue (la fecha). */
  sub?: string;
}

export interface ExportTable {
  /** Nombre corto: es el de la pestaña en Excel (máx. 31 caracteres). */
  name: string;
  title: string;
  columns: ExportColumn[];
  rows: ExportCell[][];
  /** Fila de totales al pie (solo con columnas marcadas `total`). */
  totals?: boolean;
  /** Texto cuando no hay filas. */
  vacio?: string;
  /**
   * Bloque redactado por una persona (introducción, observaciones…). Cuando
   * viene, el PDF lo pinta como párrafo corrido en vez de como tabla: un texto
   * partido en filas se lee como un listado, no como prosa. El Excel sigue
   * usando `rows`, donde cada fila es un párrafo.
   */
  texto?: string;
  /**
   * Fotos a incrustar. Cuando vienen, el PDF pinta una galería en vez de la
   * tabla: un registro fotográfico que solo lista nombres de archivo no le
   * sirve de nada a quien recibe el informe.
   *
   * El Excel sigue usando `rows` — una hoja de cálculo con imágenes embebidas
   * pesa una barbaridad y no se puede filtrar —, así que ambos formatos siguen
   * saliendo de la misma tabla y diciendo lo mismo.
   */
  imagenes?: ExportImage[];
}

export interface ExportDoc {
  title: string;
  filters: { label: string; value: string }[];
  tables: ExportTable[];
  /** Nombre base del archivo, sin extensión. */
  filename: string;
}

// ── Etiquetas en español ──────────────────────────────────────────────────────

const CATEGORIA_ES: Record<string, string> = {
  materials: 'Materiales',
  labor: 'Mano de obra',
  equipment: 'Equipos',
  subcontract: 'Subcontrato',
  travel: 'Transporte',
  other: 'Otro',
};

const METODO_ES: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  check: 'Cheque',
  card: 'Tarjeta',
  other: 'Otro',
};

const ESTADO_PROYECTO_ES: Record<string, string> = {
  draft: 'Pendiente',
  active: 'En curso',
  on_hold: 'En pausa',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

const ESTADO_TAREA_ES: Record<string, string> = {
  pending: 'Pendientes',
  in_progress: 'En progreso',
  review: 'En revisión',
  done: 'Completadas',
  cancelled: 'Canceladas',
};

const ESTADO_COTIZACION_ES: Record<string, string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  expired: 'Expirada',
};

const TIPO_FICHA_ES: Record<string, string> = {
  electrico: 'Eléctrico',
  civil: 'Civil',
  electromecanico: 'Electromecánico',
  levantamiento: 'Levantamiento',
  evaluacion_danos: 'Evaluación de daños',
};

const ESTADO_FICHA_ES: Record<string, string> = {
  borrador: 'Borrador',
  en_progreso: 'En progreso',
  enviada: 'Enviada',
};

const es = (mapa: Record<string, string>, clave: string): string => mapa[clave] ?? clave;

/**
 * Fecha a YYYY-MM-DD venga como venga.
 *
 * Dentro del servidor una columna `date`/`timestamp` llega como `Date`, aunque al
 * salir por JSON se vea como string: dar por hecho lo segundo reventaba la
 * exportación de ingresos con "p.date.slice is not a function".
 */
export function fechaISO(valor: string | Date | null | undefined): string {
  if (!valor) return '';
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? '' : valor.toISOString().slice(0, 10);
  }
  return String(valor).slice(0, 10);
}

function periodoFiltros(period?: { from: string | Date; to: string | Date }) {
  if (!period) return [];
  return [
    { label: 'Desde', value: fechaISO(period.from) || '—' },
    { label: 'Hasta', value: fechaISO(period.to) || '—' },
  ];
}

// ── Formas mínimas de cada reporte ────────────────────────────────────────────
// Se declaran aquí (en vez de importar las del service) para que este módulo no
// dependa de la capa de datos y se pueda probar con objetos literales.

export interface IncomeReportShape {
  period: { from: string | Date; to: string | Date };
  summary: {
    total: number;
    count: number;
    quotesApproved: { total: number; count: number };
    pendingPayments: { total: number; count: number };
  };
  byMethod: { method: string; count: number; total: number }[];
  payments: {
    id: string;
    amount: number;
    date: string | Date;
    method: string;
    project?: string;
    client?: string;
  }[];
}

export interface ExpensesReportShape {
  period: { from: string | Date; to: string | Date };
  summary: { total: number; count: number };
  byCategory: { category: string; count: number; total: number }[];
  byProject: { project: string; count: number; total: number }[];
  topSuppliers: { supplier: string; count: number; total: number }[];
}

export interface FichasReportShape {
  period: { from: string | Date; to: string | Date };
  summary: { total: number; enviadas: number; tasaEnvio: number };
  byType: { type: string; count: number }[];
  byStatus: { status: string; count: number }[];
  byTechnician: { name: string; total: number; enviadas: number }[];
}

export interface ProjectReportShape {
  project: {
    code: string;
    name: string;
    status: string;
    budget?: number;
    startDate?: string;
    endDate?: string;
    client?: { name: string };
  };
  tasks: Record<string, number>;
  expenses: { total: number; byCategory: Record<string, number>; budgetUsed: number | null };
  payments: { total: number };
  balance: number;
}

export interface ClientReportShape {
  client: { name: string; rnc?: string; email?: string; phone?: string };
  quotes: Record<string, { count: number; amount: number }>;
  approvedAmount: number;
  totalPaid: number;
  totalExpenses: number;
  outstanding: number;
}

// ── Constructores ─────────────────────────────────────────────────────────────

export function buildIncomeDoc(r: IncomeReportShape): ExportDoc {
  return {
    title: 'Reporte de ingresos',
    filename: 'reporte-ingresos',
    filters: periodoFiltros(r.period),
    tables: [
      {
        name: 'Resumen',
        title: 'Resumen del período',
        columns: [{ header: 'Concepto' }, { header: 'Cantidad', type: 'int' }, { header: 'Monto', type: 'money' }],
        rows: [
          ['Cobros recibidos', r.summary.count, r.summary.total],
          [
            'Cotizaciones aprobadas',
            r.summary.quotesApproved.count,
            r.summary.quotesApproved.total,
          ],
          ['Pagos pendientes', r.summary.pendingPayments.count, r.summary.pendingPayments.total],
        ],
      },
      {
        name: 'Por método',
        title: 'Cobros por método de pago',
        columns: [
          { header: 'Método' },
          { header: 'Cantidad', type: 'int', total: true },
          { header: 'Monto', type: 'money', total: true },
        ],
        rows: r.byMethod.map((m) => [es(METODO_ES, m.method), m.count, m.total]),
        totals: true,
        vacio: 'Sin cobros en el período',
      },
      {
        name: 'Detalle',
        title: 'Detalle de cobros',
        columns: [
          { header: 'Fecha', type: 'date' },
          { header: 'Cliente' },
          { header: 'Proyecto' },
          { header: 'Método' },
          { header: 'Monto', type: 'money', total: true },
        ],
        rows: r.payments.map((p) => [
          fechaISO(p.date),
          p.client ?? '—',
          p.project ?? '—',
          es(METODO_ES, p.method),
          p.amount,
        ]),
        totals: true,
        vacio: 'Sin cobros en el período',
      },
    ],
  };
}

export function buildExpensesDoc(r: ExpensesReportShape): ExportDoc {
  return {
    title: 'Reporte de gastos',
    filename: 'reporte-gastos',
    filters: periodoFiltros(r.period),
    tables: [
      {
        name: 'Resumen',
        title: 'Resumen del período',
        columns: [{ header: 'Concepto' }, { header: 'Cantidad', type: 'int' }, { header: 'Monto', type: 'money' }],
        rows: [['Gastos registrados', r.summary.count, r.summary.total]],
      },
      {
        name: 'Por categoría',
        title: 'Gastos por categoría',
        columns: [
          { header: 'Categoría' },
          { header: 'Cantidad', type: 'int', total: true },
          { header: 'Monto', type: 'money', total: true },
        ],
        rows: r.byCategory.map((c) => [es(CATEGORIA_ES, c.category), c.count, c.total]),
        totals: true,
        vacio: 'Sin gastos en el período',
      },
      {
        name: 'Por proyecto',
        title: 'Gastos por proyecto',
        columns: [
          { header: 'Proyecto' },
          { header: 'Cantidad', type: 'int', total: true },
          { header: 'Monto', type: 'money', total: true },
        ],
        rows: r.byProject.map((p) => [p.project || 'Sin proyecto', p.count, p.total]),
        totals: true,
        vacio: 'Sin gastos en el período',
      },
      {
        name: 'Proveedores',
        title: 'Principales proveedores',
        columns: [
          { header: 'Proveedor' },
          { header: 'Compras', type: 'int', total: true },
          { header: 'Monto', type: 'money', total: true },
        ],
        rows: r.topSuppliers.map((s) => [s.supplier || '—', s.count, s.total]),
        totals: true,
        vacio: 'Sin proveedores en el período',
      },
    ],
  };
}

export function buildFichasDoc(r: FichasReportShape): ExportDoc {
  return {
    title: 'Reporte de fichas técnicas',
    filename: 'reporte-fichas',
    filters: periodoFiltros(r.period),
    tables: [
      {
        name: 'Resumen',
        title: 'Resumen del período',
        columns: [{ header: 'Concepto' }, { header: 'Valor', type: 'text' }],
        rows: [
          ['Fichas creadas', String(r.summary.total)],
          ['Fichas enviadas', String(r.summary.enviadas)],
          ['Tasa de envío', `${r.summary.tasaEnvio}%`],
        ],
      },
      {
        name: 'Por tipo',
        title: 'Fichas por tipo',
        columns: [{ header: 'Tipo' }, { header: 'Cantidad', type: 'int', total: true }],
        rows: r.byType.map((t) => [es(TIPO_FICHA_ES, t.type), t.count]),
        totals: true,
        vacio: 'Sin fichas en el período',
      },
      {
        name: 'Por estado',
        title: 'Fichas por estado',
        columns: [{ header: 'Estado' }, { header: 'Cantidad', type: 'int', total: true }],
        rows: r.byStatus.map((s) => [es(ESTADO_FICHA_ES, s.status), s.count]),
        totals: true,
        vacio: 'Sin fichas en el período',
      },
      {
        name: 'Por técnico',
        title: 'Fichas por técnico',
        columns: [
          { header: 'Técnico' },
          { header: 'Creadas', type: 'int', total: true },
          { header: 'Enviadas', type: 'int', total: true },
        ],
        rows: r.byTechnician.map((t) => [t.name, t.total, t.enviadas]),
        totals: true,
        vacio: 'Sin fichas en el período',
      },
    ],
  };
}

export function buildProjectDoc(r: ProjectReportShape): ExportDoc {
  const p = r.project;
  const tareas = Object.entries(r.tasks ?? {});
  const categorias = Object.entries(r.expenses?.byCategory ?? {});

  return {
    title: `Reporte de proyecto — ${p.code}`,
    filename: `reporte-proyecto-${p.code}`,
    filters: [
      { label: 'Proyecto', value: `${p.code} — ${p.name}` },
      { label: 'Cliente', value: p.client?.name ?? '—' },
      { label: 'Estado', value: es(ESTADO_PROYECTO_ES, p.status) },
    ],
    tables: [
      {
        name: 'Resumen',
        title: 'Resumen económico',
        columns: [{ header: 'Concepto' }, { header: 'Monto', type: 'money' }],
        rows: [
          ['Presupuesto', p.budget ?? 0],
          ['Gastos', r.expenses?.total ?? 0],
          ['Cobros', r.payments?.total ?? 0],
          ['Balance', r.balance ?? 0],
        ],
      },
      {
        name: 'Gastos',
        title: 'Gastos por categoría',
        columns: [{ header: 'Categoría' }, { header: 'Monto', type: 'money', total: true }],
        rows: categorias.map(([cat, monto]) => [es(CATEGORIA_ES, cat), monto ?? 0]),
        totals: true,
        vacio: 'Sin gastos registrados',
      },
      {
        name: 'Tareas',
        title: 'Tareas por estado',
        columns: [{ header: 'Estado' }, { header: 'Cantidad', type: 'int', total: true }],
        rows: tareas.map(([estado, cantidad]) => [es(ESTADO_TAREA_ES, estado), cantidad ?? 0]),
        totals: true,
        vacio: 'Sin tareas registradas',
      },
    ],
  };
}

export function buildClientDoc(
  r: ClientReportShape & {
    /** Proyectos del cliente; opcional para no romper llamadas antiguas. */
    projects?: {
      code: string;
      name: string;
      status: string;
      budget: number | null;
      startDate?: string | Date | null;
    }[];
  },
): ExportDoc {
  const cotizaciones = Object.entries(r.quotes ?? {});
  const proyectos = r.projects ?? [];

  return {
    title: `Reporte de cliente — ${r.client.name}`,
    filename: `reporte-cliente-${r.client.name}`,
    filters: [
      { label: 'Cliente', value: r.client.name },
      { label: 'RNC', value: r.client.rnc || '—' },
    ],
    tables: [
      {
        name: 'Resumen',
        title: 'Estado de cuenta',
        columns: [{ header: 'Concepto' }, { header: 'Monto', type: 'money' }],
        rows: [
          ['Cotizado y aprobado', r.approvedAmount ?? 0],
          ['Cobrado', r.totalPaid ?? 0],
          ['Gastos imputados', r.totalExpenses ?? 0],
          ['Pendiente de cobro', r.outstanding ?? 0],
        ],
      },
      {
        name: 'Cotizaciones',
        title: 'Cotizaciones por estado',
        columns: [
          { header: 'Estado' },
          { header: 'Cantidad', type: 'int', total: true },
          { header: 'Monto', type: 'money', total: true },
        ],
        rows: cotizaciones.map(([estado, v]) => [
          es(ESTADO_COTIZACION_ES, estado),
          v?.count ?? 0,
          v?.amount ?? 0,
        ]),
        totals: true,
        vacio: 'Sin cotizaciones',
      },
      {
        name: 'Proyectos',
        title: 'Proyectos del cliente',
        columns: [
          { header: 'Código' },
          { header: 'Proyecto' },
          { header: 'Estado' },
          { header: 'Inicio', type: 'date' },
          { header: 'Presupuesto', type: 'money', total: true },
        ],
        rows: proyectos.map((p) => [
          p.code,
          p.name,
          es(ESTADO_PROYECTO_ES, p.status),
          fechaISO(p.startDate),
          p.budget ?? 0,
        ]),
        totals: true,
        vacio: 'Sin proyectos',
      },
    ],
  };
}
