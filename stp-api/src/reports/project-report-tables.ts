/**
 * Informes de proyecto — construcción PURA de los dos documentos.
 *
 * Hay DOS informes por proyecto y son documentos distintos, no dos vistas del
 * mismo:
 *
 *   · INTERNO — para la casa: gastos por categoría y detallados, nómina
 *     imputada, cobros, balance, presupuesto vs. real y margen.
 *   · CLIENTE — para entregar: avance de obra, tareas, fichas técnicas, fotos y
 *     cronología de cobros. **No lleva gastos, ni nómina, ni margen.**
 *
 * La separación no es cosmética. `buildClientProjectDoc` recibe
 * `ClientProjectReportShape`, un tipo que NO TIENE campos de gastos, nómina ni
 * margen, y el servicio que lo alimenta no consulta esos repositorios. Aunque
 * alguien "descomentara" algo por error, no habría de dónde sacar la cifra. Por
 * encima de eso, las tablas calculadas del informe de cliente pasan por
 * `assertSinEconomiaInterna()` antes de salir: si un número o una etiqueta
 * económica se colara, el informe revienta en vez de imprimirse. Filtrar el
 * margen a un cliente es el fallo caro de este módulo; se prefiere un error.
 *
 * Este archivo es lógica pura: sin base de datos, sin PDFKit, sin ExcelJS.
 * Importa los tipos de `report-tables.ts` sin modificarlo, así que el PDF y el
 * Excel siguen saliendo iguales por construcción.
 */

import type { ExportCell, ExportDoc, ExportTable } from './report-tables';
import type {
  ProjectReportInclude,
  ProjectReportManualItem,
  ProjectReportSection,
} from './entities/project-report.entity';

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
  pending: 'Pendiente',
  in_progress: 'En progreso',
  review: 'En revisión',
  done: 'Completada',
  cancelled: 'Cancelada',
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
 * Dentro del servidor una columna `date`/`timestamp` llega como `Date`, aunque
 * al salir por JSON se vea como string. Dar por hecho lo segundo ya tumbó una
 * exportación en producción ("p.date.slice is not a function"), así que aquí se
 * aceptan las dos formas. Réplica deliberada del helper de `report-tables.ts`,
 * que no lo exporta y no se debe tocar.
 */
export function fechaISO(valor: string | Date | null | undefined): string {
  if (!valor) return '';
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? '' : valor.toISOString().slice(0, 10);
  }
  return String(valor).slice(0, 10);
}

const fecha = (v: string | Date | null | undefined): string => fechaISO(v) || '—';

const pct = (n: number | null | undefined): string => (n == null ? '—' : `${n}%`);

/** Redondeo a dos decimales, que es la moneda con la que se trabaja. */
const round2 = (n: number): number => Math.round((n || 0) * 100) / 100;

// ── Texto libre ───────────────────────────────────────────────────────────────

/**
 * Bloque de texto redactado por el usuario.
 *
 * El PDF lo pinta como párrafo corrido (campo `texto`); el Excel no sabe de
 * párrafos, así que recibe en `rows` un párrafo por fila. El troceo por ancho
 * lo hace ahora el renderizador del PDF, que sí puede medir la fuente.
 */
function tablaTexto(name: string, title: string, texto?: string): ExportTable | null {
  const limpio = String(texto ?? '').trim();
  if (limpio === '') return null;
  const parrafos = limpio.split(/\r?\n/).filter((p) => p.trim() !== '');
  return {
    name: name.slice(0, 31),
    title,
    columns: [{ header: title }],
    rows: parrafos.map((p) => [p] as ExportCell[]),
    texto: limpio,
  };
}

/** Introducción, observaciones, conclusiones y las secciones libres del usuario. */
function tablasRedactadas(
  settings: ProjectReportSettingsShape,
  donde: 'antes' | 'despues',
): ExportTable[] {
  if (donde === 'antes') {
    return [tablaTexto('Introducción', 'Introducción', settings.intro)].filter(
      (t): t is ExportTable => t !== null,
    );
  }

  const secciones = (settings.sections ?? [])
    .filter((s) => (s?.title ?? '').trim() !== '' || (s?.body ?? '').trim() !== '')
    .map((s, i) => tablaTexto(`Sección ${i + 1}`, s.title?.trim() || `Sección ${i + 1}`, s.body));

  return [
    ...secciones,
    tablaTexto('Observaciones', 'Observaciones', settings.observations),
    tablaTexto('Conclusiones', 'Conclusiones y recomendaciones', settings.conclusions),
  ].filter((t): t is ExportTable => t !== null);
}

/**
 * Tabla de conceptos añadidos a mano.
 *
 * Va SIEMPRE rotulada y separada de las cifras calculadas: es lo único del
 * informe cuyo importe no sale de la base de datos, y quien lo lea tiene que
 * poder distinguirlo de un vistazo.
 */
function tablaConceptosManuales(items: ProjectReportManualItem[]): ExportTable | null {
  const filas = (items ?? []).filter((i) => (i?.description ?? '').trim() !== '');
  if (filas.length === 0) return null;
  return {
    name: 'Conceptos manuales',
    title: 'Conceptos añadidos a mano (no calculados, no salen de la base de datos)',
    columns: [
      { header: 'Concepto' },
      { header: 'Nota' },
      { header: 'Monto', type: 'money', total: true },
    ],
    rows: filas.map((i) => [i.description, i.notes ?? '—', round2(Number(i.amount) || 0)]),
    totals: true,
  };
}

// ── Formas de entrada ─────────────────────────────────────────────────────────
// Se declaran aquí, no se importan del service, para poder probar con literales.

export interface ProjectReportSettingsShape {
  title?: string;
  intro?: string;
  observations?: string;
  conclusions?: string;
  sections?: ProjectReportSection[];
  manualItems?: ProjectReportManualItem[];
  include: ProjectReportInclude;
}

export interface ProjectHeaderShape {
  code: string;
  name: string;
  status: string;
  startDate?: string | Date;
  endDate?: string | Date;
  location?: string;
  client?: { name: string };
}

/**
 * INFORME INTERNO. Todo lo económico del proyecto.
 */
export interface InternalProjectReportShape {
  project: ProjectHeaderShape & { budget?: number };
  settings: ProjectReportSettingsShape;
  tasks: Record<string, number>;
  expenses: {
    total: number;
    byCategory: Record<string, number>;
    budgetUsed: number | null;
    /** Detalle línea a línea (vacío si el bloque está desmarcado). */
    detail: {
      date: string | Date;
      description: string;
      category: string;
      supplier?: string;
      amount: number;
    }[];
  };
  /**
   * Nómina imputada al proyecto. OJO: es el DESGLOSE de la categoría
   * "Mano de obra" de los gastos, no un importe adicional — al marcar un pago de
   * nómina como pagado el módulo payroll ya crea el gasto correspondiente. Se
   * muestra para saber a quién se le pagó, y por eso no se suma al total.
   */
  payroll: {
    total: number;
    entries: {
      number: string;
      collaborator: string;
      periodStart: string | Date;
      periodEnd: string | Date;
      days: number | null;
      gross: number;
    }[];
  };
  payments: {
    total: number;
    detail: { date: string | Date; description: string; method: string; amount: number }[];
  };
  /** Cobros − gastos. Lo calcula `getProjectSummary`. */
  balance: number;
}

/**
 * INFORME DE CLIENTE. Fíjate en lo que NO hay en este tipo: gastos, nómina,
 * balance, presupuesto y margen. No es que se oculten al pintar — es que no
 * existen en el documento.
 */
export interface ClientProjectReportShape {
  project: ProjectHeaderShape & { description?: string };
  settings: ProjectReportSettingsShape;
  progress: { total: number; done: number; percent: number };
  tasks: {
    title: string;
    status: string;
    dueDate?: string | Date;
    completedAt?: string | Date;
  }[];
  fichas: { code: string; type: string; status: string; date?: string | Date }[];
  photos: { name: string; date?: string | Date }[];
  /** Cronología de lo que el cliente ha pagado. Es su propio dinero, no la economía interna. */
  receipts: { date: string | Date; description: string; method: string; amount: number }[];
}

// ── Guardia del informe de cliente ────────────────────────────────────────────

/**
 * Palabras que no pueden aparecer en la ESTRUCTURA (nombre, título, cabeceras
 * y texto de "sin datos") de las tablas calculadas del informe de cliente.
 *
 * Se mira la estructura y no el contenido de las celdas a propósito: los datos
 * llevan texto escrito por personas —la descripción de un pago puede decir
 * "abono a presupuesto"— y hacer saltar el informe por eso sería un falso
 * positivo constante. Lo que ataja esta guardia es el error de programación:
 * una tabla del informe interno copiada aquí por descuido. Todas las del
 * informe interno se delatan por su título o por sus cabeceras.
 *
 * Tampoco se aplica al texto que redacta el usuario: si escribe "sin gastos
 * adicionales" en las observaciones, es su documento y su decisión.
 */
const PROHIBIDO_EN_INFORME_CLIENTE = [
  'gasto',
  'margen',
  'nómina',
  'nomina',
  'utilidad',
  'presupuesto',
  'balance',
  'económic',
  'economic',
  'costo',
  'coste',
  'rentabilidad',
  'proveedor',
  'categoría',
];

export function assertSinEconomiaInterna(tablas: ExportTable[]): void {
  const textos: string[] = [];
  for (const t of tablas) {
    textos.push(t.name, t.title, t.vacio ?? '');
    for (const c of t.columns) textos.push(c.header);
  }

  const plano = textos.join('   ').toLowerCase();
  const encontrado = PROHIBIDO_EN_INFORME_CLIENTE.filter((p) => plano.includes(p));
  if (encontrado.length > 0) {
    throw new Error(
      `El informe de cliente no puede contener economía interna (encontrado: ${encontrado.join(', ')}). ` +
        'Ese dato pertenece al informe interno.',
    );
  }
}

// ── Informe interno ───────────────────────────────────────────────────────────

export function buildInternalProjectDoc(r: InternalProjectReportShape): ExportDoc {
  const p = r.project;
  const inc = r.settings.include;

  const presupuesto = p.budget ?? 0;
  const gastos = r.expenses?.total ?? 0;
  const cobros = r.payments?.total ?? 0;
  const balance = r.balance ?? 0;
  // Margen previsto: lo que quedaría si el proyecto se cobrara íntegro al
  // presupuesto. Sin presupuesto no hay margen que calcular (y no se inventa).
  const margen = presupuesto > 0 ? round2(presupuesto - gastos) : null;
  const margenPct = presupuesto > 0 ? round2(((presupuesto - gastos) / presupuesto) * 100) : null;

  const tareas = Object.entries(r.tasks ?? {});
  const totalTareas = tareas.reduce((a, [, n]) => a + (n ?? 0), 0);
  const hechas = r.tasks?.done ?? 0;
  const avance = totalTareas > 0 ? round2((hechas / totalTareas) * 100) : null;

  const tablas: (ExportTable | null)[] = [
    ...tablasRedactadas(r.settings, 'antes'),

    {
      name: 'Resumen',
      title: 'Resumen económico',
      columns: [{ header: 'Concepto' }, { header: 'Monto', type: 'money' }],
      rows: [
        ['Presupuesto', presupuesto],
        ['Gastos registrados', gastos],
        ['Cobros recibidos', cobros],
        ['Balance (cobros − gastos)', balance],
        ['Margen previsto (presupuesto − gastos)', margen],
      ],
    },

    {
      name: 'Presupuesto vs real',
      title: 'Presupuesto vs. real',
      columns: [{ header: 'Indicador' }, { header: 'Valor' }],
      rows: [
        ['Presupuesto consumido', pct(r.expenses?.budgetUsed ?? null)],
        ['Margen previsto sobre presupuesto', pct(margenPct)],
        ['Avance de tareas', pct(avance)],
        ['Cobrado sobre presupuesto', pct(presupuesto > 0 ? round2((cobros / presupuesto) * 100) : null)],
      ],
    },

    {
      name: 'Gastos',
      title: 'Gastos por categoría',
      columns: [{ header: 'Categoría' }, { header: 'Monto', type: 'money', total: true }],
      rows: Object.entries(r.expenses?.byCategory ?? {}).map(([cat, monto]) => [
        es(CATEGORIA_ES, cat),
        monto ?? 0,
      ]),
      totals: true,
      vacio: 'Sin gastos registrados',
    },

    inc.detalleGastos
      ? {
          name: 'Detalle gastos',
          title: 'Detalle de gastos',
          columns: [
            { header: 'Fecha', type: 'date' },
            { header: 'Descripción' },
            { header: 'Categoría' },
            { header: 'Proveedor' },
            { header: 'Monto', type: 'money', total: true },
          ],
          rows: (r.expenses?.detail ?? []).map((e) => [
            fecha(e.date),
            e.description,
            es(CATEGORIA_ES, e.category),
            e.supplier || '—',
            e.amount ?? 0,
          ]),
          totals: true,
          vacio: 'Sin gastos registrados',
        }
      : null,

    inc.nomina
      ? {
          name: 'Nómina',
          title:
            'Mano de obra imputada (nómina) — ya incluida en la categoría "Mano de obra", no se suma aparte',
          columns: [
            { header: 'Nº' },
            { header: 'Colaborador' },
            { header: 'Período' },
            { header: 'Días', type: 'int' },
            { header: 'Bruto', type: 'money', total: true },
          ],
          rows: (r.payroll?.entries ?? []).map((n) => [
            n.number,
            n.collaborator,
            `${fecha(n.periodStart)} → ${fecha(n.periodEnd)}`,
            n.days ?? 0,
            n.gross ?? 0,
          ]),
          totals: true,
          vacio: 'Sin nómina imputada al proyecto',
        }
      : null,

    inc.tareas
      ? {
          name: 'Tareas',
          title: 'Tareas por estado',
          columns: [{ header: 'Estado' }, { header: 'Cantidad', type: 'int', total: true }],
          rows: tareas.map(([estado, cantidad]) => [es(ESTADO_TAREA_ES, estado), cantidad ?? 0]),
          totals: true,
          vacio: 'Sin tareas registradas',
        }
      : null,

    inc.cronologia
      ? {
          name: 'Cobros',
          title: 'Cobros recibidos',
          columns: [
            { header: 'Fecha', type: 'date' },
            { header: 'Descripción' },
            { header: 'Método' },
            { header: 'Monto', type: 'money', total: true },
          ],
          rows: (r.payments?.detail ?? []).map((c) => [
            fecha(c.date),
            c.description,
            es(METODO_ES, c.method),
            c.amount ?? 0,
          ]),
          totals: true,
          vacio: 'Sin cobros registrados',
        }
      : null,

    inc.conceptosManuales ? tablaConceptosManuales(r.settings.manualItems ?? []) : null,

    ...tablasRedactadas(r.settings, 'despues'),
  ];

  return {
    title: r.settings.title?.trim() || `Informe interno — ${p.code}`,
    filename: `informe-interno-${p.code}`,
    filters: [
      { label: 'Proyecto', value: `${p.code} — ${p.name}` },
      { label: 'Cliente', value: p.client?.name ?? '—' },
      { label: 'Estado', value: es(ESTADO_PROYECTO_ES, p.status) },
      { label: 'Uso', value: 'DOCUMENTO INTERNO — no entregar al cliente' },
    ],
    tables: tablas.filter((t): t is ExportTable => t !== null),
  };
}

// ── Informe de cliente ────────────────────────────────────────────────────────

export function buildClientProjectDoc(r: ClientProjectReportShape): ExportDoc {
  const p = r.project;
  const inc = r.settings.include;

  // Las tablas CALCULADAS se construyen aparte para poder auditarlas enteras
  // antes de armar el documento. Las redactadas por el usuario quedan fuera de
  // la guardia a propósito (ver `assertSinEconomiaInterna`).
  const calculadas: (ExportTable | null)[] = [
    {
      name: 'Avance',
      title: 'Avance de obra',
      columns: [{ header: 'Concepto' }, { header: 'Valor' }],
      rows: [
        ['Estado del proyecto', es(ESTADO_PROYECTO_ES, p.status)],
        ['Ubicación', p.location || '—'],
        ['Fecha de inicio', fecha(p.startDate)],
        ['Fecha de término prevista', fecha(p.endDate)],
        ['Actividades completadas', `${r.progress?.done ?? 0} de ${r.progress?.total ?? 0}`],
        ['Avance', pct(r.progress?.percent ?? null)],
      ],
    },

    inc.tareas
      ? {
          name: 'Actividades',
          title: 'Actividades del proyecto',
          columns: [
            { header: 'Actividad' },
            { header: 'Estado' },
            { header: 'Fecha prevista', type: 'date' },
            { header: 'Completada', type: 'date' },
          ],
          rows: (r.tasks ?? []).map((t) => [
            t.title,
            es(ESTADO_TAREA_ES, t.status),
            fecha(t.dueDate),
            fecha(t.completedAt),
          ]),
          vacio: 'Sin actividades registradas',
        }
      : null,

    inc.fichas
      ? {
          name: 'Fichas',
          title: 'Fichas técnicas de campo',
          columns: [
            { header: 'Código' },
            { header: 'Tipo' },
            { header: 'Estado' },
            { header: 'Fecha', type: 'date' },
          ],
          rows: (r.fichas ?? []).map((f) => [
            f.code,
            es(TIPO_FICHA_ES, f.type),
            es(ESTADO_FICHA_ES, f.status),
            fecha(f.date),
          ]),
          vacio: 'Sin fichas técnicas',
        }
      : null,

    inc.fotos
      ? {
          name: 'Fotos',
          title: 'Registro fotográfico',
          columns: [{ header: 'Archivo' }, { header: 'Fecha', type: 'date' }],
          rows: (r.photos ?? []).map((f) => [f.name, fecha(f.date)]),
          vacio: 'Sin fotos registradas',
        }
      : null,

    inc.cronologia
      ? {
          name: 'Pagos',
          title: 'Cronología de pagos recibidos',
          columns: [
            { header: 'Fecha', type: 'date' },
            { header: 'Concepto' },
            { header: 'Forma de pago' },
            { header: 'Monto', type: 'money', total: true },
          ],
          rows: (r.receipts ?? []).map((c) => [
            fecha(c.date),
            c.description,
            es(METODO_ES, c.method),
            c.amount ?? 0,
          ]),
          totals: true,
          vacio: 'Sin pagos registrados',
        }
      : null,
  ];

  const tablasCalculadas = calculadas.filter((t): t is ExportTable => t !== null);
  assertSinEconomiaInterna(tablasCalculadas);

  const manuales = inc.conceptosManuales
    ? tablaConceptosManuales(r.settings.manualItems ?? [])
    : null;

  return {
    title: r.settings.title?.trim() || `Informe de proyecto — ${p.code}`,
    filename: `informe-cliente-${p.code}`,
    filters: [
      { label: 'Proyecto', value: `${p.code} — ${p.name}` },
      { label: 'Cliente', value: p.client?.name ?? '—' },
      { label: 'Estado', value: es(ESTADO_PROYECTO_ES, p.status) },
    ],
    tables: [
      ...tablasRedactadas(r.settings, 'antes'),
      ...tablasCalculadas,
      ...(manuales ? [manuales] : []),
      ...tablasRedactadas(r.settings, 'despues'),
    ],
  };
}
