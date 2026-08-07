import {
  assertSinEconomiaInterna,
  buildClientProjectDoc,
  buildInternalProjectDoc,
  type ClientProjectReportShape,
  type InternalProjectReportShape,
  type ProjectReportSettingsShape,
} from './project-report-tables';
import type { ExportDoc, ExportTable } from './report-tables';
import { ProjectReportService } from './project-report.service';
import { ProjectReportType } from './entities/project-report.entity';

/**
 * Lo que se prueba aquí, por orden de importancia:
 *
 *  1. El informe de CLIENTE no lleva gastos, nómina, presupuesto ni margen.
 *     Es el fallo caro de esta fase: filtrarle el margen a un cliente.
 *  2. Las cifras del informe interno salen tal cual de los datos calculados.
 *  3. Las fechas se aceptan como `Date` (lo que devuelve realmente el servidor)
 *     y como string.
 */

// ── Constructores de datos de prueba ─────────────────────────────────────────

function settings(over: Partial<ProjectReportSettingsShape> = {}): ProjectReportSettingsShape {
  return {
    intro: 'Resumen de la intervención realizada.',
    observations: 'Todo conforme.',
    conclusions: 'Se recomienda mantenimiento anual.',
    sections: [],
    manualItems: [],
    include: ProjectReportService.defaultInclude(ProjectReportType.CLIENT),
    ...over,
  };
}

function interno(over: Partial<InternalProjectReportShape> = {}): InternalProjectReportShape {
  return {
    project: {
      code: 'PRJ-2026-007',
      name: 'Planta baja',
      status: 'active',
      budget: 100000,
      startDate: '2026-01-10',
      endDate: '2026-03-30',
      location: 'Santo Domingo',
      client: { name: 'Cliente A' },
    },
    settings: settings({ include: ProjectReportService.defaultInclude(ProjectReportType.INTERNAL) }),
    tasks: { done: 3, pending: 1 },
    expenses: {
      total: 60000,
      byCategory: { materials: 40000, labor: 20000 },
      budgetUsed: 60,
      detail: [
        {
          date: '2026-02-01',
          description: 'Cable THHN',
          category: 'materials',
          supplier: 'Ferretería X',
          amount: 40000,
        },
      ],
    },
    payroll: {
      total: 20000,
      entries: [
        {
          number: 'NOM-2026-003',
          collaborator: 'Juan Pérez',
          periodStart: '2026-02-01',
          periodEnd: '2026-02-15',
          days: 12,
          gross: 20000,
        },
      ],
    },
    payments: {
      total: 75000,
      detail: [
        { date: '2026-02-20', description: 'Abono 1', method: 'transfer', amount: 75000 },
      ],
    },
    balance: 15000,
    ...over,
  };
}

function cliente(over: Partial<ClientProjectReportShape> = {}): ClientProjectReportShape {
  return {
    project: {
      code: 'PRJ-2026-007',
      name: 'Planta baja',
      status: 'active',
      startDate: '2026-01-10',
      endDate: '2026-03-30',
      location: 'Santo Domingo',
      client: { name: 'Cliente A' },
    },
    settings: settings(),
    progress: { total: 4, done: 3, percent: 75 },
    tasks: [
      { title: 'Canalización', status: 'done', dueDate: '2026-02-01', completedAt: '2026-01-31' },
      { title: 'Cableado', status: 'in_progress', dueDate: '2026-03-01' },
    ],
    fichas: [{ code: 'FIC-2026-011', type: 'electrico', status: 'enviada', date: '2026-02-10' }],
    photos: [{ name: 'panel-principal.jpg', date: '2026-02-11' }],
    receipts: [
      { date: '2026-02-20', description: 'Abono 1', method: 'transfer', amount: 75000 },
    ],
    ...over,
  };
}

/** Todo el texto del documento, aplanado, para buscar filtraciones. */
const textoDe = (doc: ExportDoc): string =>
  [
    doc.title,
    doc.filename,
    ...doc.filters.flatMap((f) => [f.label, f.value]),
    ...doc.tables.flatMap((t) => [
      t.name,
      t.title,
      t.vacio ?? '',
      ...t.columns.map((c) => c.header),
      ...t.rows.flat().map((c) => String(c ?? '')),
    ]),
  ]
    .join(' | ')
    .toLowerCase();

/** Todos los números que aparecen como celda numérica. */
const numerosDe = (doc: ExportDoc): number[] =>
  doc.tables.flatMap((t) => t.rows.flat().filter((c): c is number => typeof c === 'number'));

const tabla = (doc: ExportDoc, name: string): ExportTable | undefined =>
  doc.tables.find((t) => t.name === name);

// ── 1. La regla que no se puede romper ───────────────────────────────────────

describe('buildClientProjectDoc — el informe de cliente NO lleva economía interna', () => {
  it('no menciona gastos, nómina, presupuesto, balance ni margen', () => {
    const doc = buildClientProjectDoc(cliente());
    const texto = textoDe(doc);

    for (const prohibido of [
      'gasto',
      'nómina',
      'nomina',
      'margen',
      'presupuesto',
      'balance',
      'utilidad',
      'rentabilidad',
      'proveedor',
      'categoría',
    ]) {
      expect(texto).not.toContain(prohibido);
    }
  });

  it('no filtra ninguna cifra de gastos, margen ni presupuesto', () => {
    // Los mismos números que el informe interno de ese proyecto: 100000 de
    // presupuesto, 60000 de gastos, 40000 de materiales, 20000 de nómina,
    // 15000 de balance. Ninguno puede aparecer en el documento del cliente.
    const numeros = numerosDe(buildClientProjectDoc(cliente()));
    for (const cifra of [100000, 60000, 40000, 20000, 15000]) {
      expect(numeros).not.toContain(cifra);
    }
    // Lo suyo sí está: lo que ha pagado.
    expect(numeros).toContain(75000);
  });

  it('ignora las casillas del informe interno aunque vengan marcadas', () => {
    // Un `include` con todo a true (el del informe interno) no puede hacer
    // aparecer tablas económicas: esos bloques no existen en este documento.
    const doc = buildClientProjectDoc(
      cliente({
        settings: settings({
          include: {
            ...ProjectReportService.defaultInclude(ProjectReportType.CLIENT),
            detalleGastos: true,
            nomina: true,
          },
        }),
      }),
    );
    expect(tabla(doc, 'Detalle gastos')).toBeUndefined();
    expect(tabla(doc, 'Nómina')).toBeUndefined();
    expect(textoDe(doc)).not.toContain('gasto');
  });

  it('la guardia revienta si alguien cuela una tabla del informe interno', () => {
    expect(() =>
      assertSinEconomiaInterna([
        {
          name: 'Gastos',
          title: 'Gastos por categoría',
          columns: [{ header: 'Categoría' }, { header: 'Monto', type: 'money' }],
          rows: [['Materiales', 40000]],
        },
      ]),
    ).toThrow(/economía interna/i);
  });

  it('las tablas legítimas del informe de cliente pasan la guardia', () => {
    expect(() => buildClientProjectDoc(cliente())).not.toThrow();
  });

  it('no se cae si el proyecto no tiene fichas, fotos ni pagos', () => {
    const doc = buildClientProjectDoc(
      cliente({ fichas: [], photos: [], receipts: [], tasks: [] }),
    );
    expect(tabla(doc, 'Fotos')!.rows).toHaveLength(0);
    expect(tabla(doc, 'Fotos')!.vacio).toBeTruthy();
    expect(textoDe(doc)).not.toContain('gasto');
  });
});

// ── 2. Contenido del informe de cliente ──────────────────────────────────────

describe('buildClientProjectDoc — contenido', () => {
  it('lleva avance de obra, actividades, fichas, fotos y cronología de pagos', () => {
    const doc = buildClientProjectDoc(cliente());
    for (const name of ['Avance', 'Actividades', 'Fichas', 'Fotos', 'Pagos']) {
      expect(tabla(doc, name)).toBeDefined();
    }
    expect(tabla(doc, 'Avance')!.rows).toContainEqual(['Avance', '75%']);
    expect(tabla(doc, 'Actividades')!.rows[0][1]).toBe('Completada');
  });

  it('respeta las casillas de incluir/excluir bloques', () => {
    const doc = buildClientProjectDoc(
      cliente({
        settings: settings({
          include: {
            ...ProjectReportService.defaultInclude(ProjectReportType.CLIENT),
            fotos: false,
            fichas: false,
          },
        }),
      }),
    );
    expect(tabla(doc, 'Fotos')).toBeUndefined();
    expect(tabla(doc, 'Fichas')).toBeUndefined();
    expect(tabla(doc, 'Pagos')).toBeDefined();
  });

  it('acepta las fechas como Date, que es lo que devuelve el servidor', () => {
    const doc = buildClientProjectDoc(
      cliente({
        receipts: [
          {
            date: new Date('2026-02-20T00:00:00Z'),
            description: 'Abono 1',
            method: 'transfer',
            amount: 75000,
          },
        ],
      }),
    );
    expect(tabla(doc, 'Pagos')!.rows[0][0]).toBe('2026-02-20');
  });

  it('usa el título editado por el usuario cuando lo hay', () => {
    const doc = buildClientProjectDoc(
      cliente({ settings: settings({ title: 'Entrega final — Planta baja' }) }),
    );
    expect(doc.title).toBe('Entrega final — Planta baja');
  });

  it('incluye la introducción, observaciones y conclusiones redactadas', () => {
    const doc = buildClientProjectDoc(cliente());
    expect(tabla(doc, 'Introducción')).toBeDefined();
    expect(tabla(doc, 'Observaciones')).toBeDefined();
    expect(tabla(doc, 'Conclusiones')).toBeDefined();
  });

  it('omite los bloques de texto que están vacíos', () => {
    const doc = buildClientProjectDoc(
      cliente({ settings: settings({ intro: '', observations: '   ', conclusions: undefined }) }),
    );
    expect(tabla(doc, 'Introducción')).toBeUndefined();
    expect(tabla(doc, 'Observaciones')).toBeUndefined();
    expect(tabla(doc, 'Conclusiones')).toBeUndefined();
  });
});

// ── 3. Informe interno ───────────────────────────────────────────────────────

describe('buildInternalProjectDoc', () => {
  it('lleva las cifras económicas tal cual vienen de los datos calculados', () => {
    const resumen = tabla(buildInternalProjectDoc(interno()), 'Resumen')!;
    expect(resumen.rows).toContainEqual(['Presupuesto', 100000]);
    expect(resumen.rows).toContainEqual(['Gastos registrados', 60000]);
    expect(resumen.rows).toContainEqual(['Cobros recibidos', 75000]);
    expect(resumen.rows).toContainEqual(['Balance (cobros − gastos)', 15000]);
    expect(resumen.rows).toContainEqual(['Margen previsto (presupuesto − gastos)', 40000]);
  });

  it('calcula los porcentajes de presupuesto, margen y avance', () => {
    const t = tabla(buildInternalProjectDoc(interno()), 'Presupuesto vs real')!;
    expect(t.rows).toContainEqual(['Presupuesto consumido', '60%']);
    expect(t.rows).toContainEqual(['Margen previsto sobre presupuesto', '40%']);
    expect(t.rows).toContainEqual(['Avance de tareas', '75%']);
  });

  it('no inventa margen cuando el proyecto no tiene presupuesto', () => {
    const doc = buildInternalProjectDoc(
      interno({ project: { ...interno().project, budget: undefined } }),
    );
    expect(tabla(doc, 'Resumen')!.rows).toContainEqual([
      'Margen previsto (presupuesto − gastos)',
      null,
    ]);
    expect(tabla(doc, 'Presupuesto vs real')!.rows).toContainEqual([
      'Margen previsto sobre presupuesto',
      '—',
    ]);
  });

  it('desglosa la nómina y avisa de que ya está dentro de los gastos', () => {
    const t = tabla(buildInternalProjectDoc(interno()), 'Nómina')!;
    expect(t.title).toMatch(/no se suma aparte/i);
    expect(t.rows[0]).toEqual([
      'NOM-2026-003',
      'Juan Pérez',
      '2026-02-01 → 2026-02-15',
      12,
      20000,
    ]);
  });

  it('marca el documento como interno en la cabecera', () => {
    const doc = buildInternalProjectDoc(interno());
    expect(doc.filters.map((f) => f.value).join(' ')).toMatch(/no entregar al cliente/i);
    expect(doc.filename).toBe('informe-interno-PRJ-2026-007');
  });

  it('respeta las casillas de detalle de gastos y nómina', () => {
    const doc = buildInternalProjectDoc(
      interno({
        settings: settings({
          include: {
            ...ProjectReportService.defaultInclude(ProjectReportType.INTERNAL),
            detalleGastos: false,
            nomina: false,
          },
        }),
      }),
    );
    expect(tabla(doc, 'Detalle gastos')).toBeUndefined();
    expect(tabla(doc, 'Nómina')).toBeUndefined();
    // El resumen por categoría no es opcional: es el cuerpo del informe interno.
    expect(tabla(doc, 'Gastos')).toBeDefined();
  });
});

// ── 4. Conceptos añadidos a mano ─────────────────────────────────────────────

describe('conceptos añadidos a mano', () => {
  const manuales = [{ id: 'm1', description: 'Ajuste acordado', amount: 5000, notes: 'Verbal' }];

  it('van en su propia tabla, rotulada como no calculada, en los dos informes', () => {
    for (const doc of [
      buildInternalProjectDoc(
        interno({
          settings: settings({
            manualItems: manuales,
            include: ProjectReportService.defaultInclude(ProjectReportType.INTERNAL),
          }),
        }),
      ),
      buildClientProjectDoc(cliente({ settings: settings({ manualItems: manuales }) })),
    ]) {
      const t = tabla(doc, 'Conceptos manuales')!;
      expect(t).toBeDefined();
      expect(t.title).toMatch(/no calculados/i);
      expect(t.rows[0]).toEqual(['Ajuste acordado', 'Verbal', 5000]);
    }
  });

  it('no suman con las cifras calculadas del resumen', () => {
    const doc = buildInternalProjectDoc(
      interno({
        settings: settings({
          manualItems: manuales,
          include: ProjectReportService.defaultInclude(ProjectReportType.INTERNAL),
        }),
      }),
    );
    // 60000 sigue siendo 60000: el apunte manual no toca el gasto calculado.
    expect(tabla(doc, 'Resumen')!.rows).toContainEqual(['Gastos registrados', 60000]);
  });

  it('la tabla desaparece si no hay conceptos o si la casilla está desmarcada', () => {
    expect(tabla(buildClientProjectDoc(cliente()), 'Conceptos manuales')).toBeUndefined();
    const doc = buildClientProjectDoc(
      cliente({
        settings: settings({
          manualItems: manuales,
          include: {
            ...ProjectReportService.defaultInclude(ProjectReportType.CLIENT),
            conceptosManuales: false,
          },
        }),
      }),
    );
    expect(tabla(doc, 'Conceptos manuales')).toBeUndefined();
  });
});

// ── 5. Envoltura del texto libre ─────────────────────────────────────────────


// ── 6. Casillas por defecto ──────────────────────────────────────────────────

describe('ProjectReportService.defaultInclude', () => {
  it('el informe interno arranca con la economía completa y sin fotos ni fichas', () => {
    const inc = ProjectReportService.defaultInclude(ProjectReportType.INTERNAL);
    expect(inc.detalleGastos).toBe(true);
    expect(inc.nomina).toBe(true);
    expect(inc.fotos).toBe(false);
    expect(inc.fichas).toBe(false);
  });

  it('el informe de cliente arranca con fotos y fichas, y sin gastos ni nómina', () => {
    const inc = ProjectReportService.defaultInclude(ProjectReportType.CLIENT);
    expect(inc.fotos).toBe(true);
    expect(inc.fichas).toBe(true);
    expect(inc.detalleGastos).toBe(false);
    expect(inc.nomina).toBe(false);
  });
});
