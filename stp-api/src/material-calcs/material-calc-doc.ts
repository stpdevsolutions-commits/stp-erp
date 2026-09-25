/**
 * Lógica pura de la calculadora de materiales en el servidor: validar el
 * resultado que manda la app, consolidar la lista de materiales, valorarla y
 * armar el documento del PDF. Sin base de datos ni PDFKit, para poder
 * probarla sola.
 */
import { BadRequestException } from '@nestjs/common';
import { ExportDoc, ExportTable } from '../reports/report-tables';

export interface LineaMaterial {
  clave: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  detalle?: string;
  exacto?: number;
}

export interface Resultado {
  resumen: { label: string; valor: string }[];
  grupos: { titulo: string; lineas: LineaMaterial[] }[];
  manoObra: { actividad: string; cuadrilla: string; rendimiento: string; dias: number }[];
  notas: string[];
  /** Datos de entrada ya formateados por la app ("Largo del muro" → "5 m"). */
  datos?: { label: string; valor: string }[];
}

/** Una línea de la lista de materiales consolidada, con su precio si lo hay. */
export interface LineaValorada {
  clave: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  materialId: string | null;
  material: string | null;
  unidadCatalogo: string | null;
  precioUnitario: number | null;
  subtotal: number | null;
}

const MAX_LINEAS = 300;

function texto(v: unknown, max = 300): string {
  if (typeof v !== 'string') throw new BadRequestException('Resultado inválido');
  return v.slice(0, max);
}

function numero(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1e9) {
    throw new BadRequestException('Resultado inválido: cantidad fuera de rango');
  }
  return v;
}

function lista(v: unknown): unknown[] {
  if (!Array.isArray(v) || v.length > MAX_LINEAS) throw new BadRequestException('Resultado inválido');
  return v;
}

/** Valida y limpia el resultado que manda la app (nunca se guarda tal cual llega). */
export function parseResultado(raw: Record<string, unknown>): Resultado {
  const obj = (v: unknown) => {
    if (!v || typeof v !== 'object') throw new BadRequestException('Resultado inválido');
    return v as Record<string, unknown>;
  };
  const par = (v: unknown) => {
    const o = obj(v);
    return { label: texto(o.label, 120), valor: texto(o.valor, 120) };
  };
  return {
    resumen: lista(raw.resumen).map(par),
    datos: raw.datos === undefined ? [] : lista(raw.datos).map(par),
    grupos: lista(raw.grupos).map((g) => {
      const go = obj(g);
      return {
        titulo: texto(go.titulo, 200),
        lineas: lista(go.lineas).map((l) => {
          const lo = obj(l);
          const clave = texto(lo.clave, 80);
          if (!/^[a-z0-9_]{1,80}$/.test(clave)) throw new BadRequestException('Resultado inválido: clave');
          return {
            clave,
            descripcion: texto(lo.descripcion, 200),
            cantidad: numero(lo.cantidad),
            unidad: texto(lo.unidad, 30),
            detalle: lo.detalle === undefined ? undefined : texto(lo.detalle, 200),
            exacto: lo.exacto === undefined ? undefined : numero(lo.exacto),
          };
        }),
      };
    }),
    manoObra: lista(raw.manoObra).map((m) => {
      const mo = obj(m);
      return {
        actividad: texto(mo.actividad, 120),
        cuadrilla: texto(mo.cuadrilla, 120),
        rendimiento: texto(mo.rendimiento, 60),
        dias: numero(mo.dias),
      };
    }),
    notas: lista(raw.notas).map((n) => texto(n, 500)),
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Suma las líneas iguales (misma clave y unidad) de todos los grupos: la
 * lista de compra. Si todas las partes traen `exacto` (fundas de cemento),
 * suma los exactos y redondea una sola vez — 1.6 + 3.7 + 3.7 son 9 fundas,
 * no 10. Mismo criterio que `totales()` en la app.
 */
export function consolidar(r: Resultado): LineaMaterial[] {
  const mapa = new Map<string, LineaMaterial & { sumaExacta: number | null }>();
  for (const g of r.grupos) {
    for (const l of g.lineas) {
      const k = `${l.clave}|${l.unidad}`;
      const prev = mapa.get(k);
      if (prev) {
        prev.cantidad = r2(prev.cantidad + l.cantidad);
        prev.sumaExacta = prev.sumaExacta != null && l.exacto != null ? prev.sumaExacta + l.exacto : null;
      } else {
        mapa.set(k, { ...l, detalle: undefined, sumaExacta: l.exacto ?? null });
      }
    }
  }
  return [...mapa.values()].map(({ sumaExacta, ...l }) =>
    sumaExacta != null ? { ...l, cantidad: Math.ceil(sumaExacta - 1e-9) } : l,
  );
}

export interface MaterialPrecio {
  id: string;
  name: string;
  unit: string | null;
  precio: number | null;
}

/** Pone precio a cada línea con el material enlazado a su clave (si lo hay). */
export function valorar(
  lineas: LineaMaterial[],
  enlaces: Map<string, MaterialPrecio>,
): { lineas: LineaValorada[]; total: number | null } {
  let total = 0;
  let alguno = false;
  const out = lineas.map((l) => {
    const m = enlaces.get(l.clave) ?? null;
    const precio = m?.precio ?? null;
    const subtotal = precio != null ? r2(precio * l.cantidad) : null;
    if (subtotal != null) {
      total += subtotal;
      alguno = true;
    }
    return {
      clave: l.clave,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      unidad: l.unidad,
      materialId: m?.id ?? null,
      material: m?.name ?? null,
      unidadCatalogo: m?.unit ?? null,
      precioUnitario: precio,
      subtotal,
    };
  });
  return { lineas: out, total: alguno ? r2(total) : null };
}

/** Documento del PDF, en el mismo formato que los informes del ERP. */
export function calcDoc(params: {
  title: string;
  projectLabel: string;
  fecha: string;
  autor: string;
  resultado: Resultado;
  lista: LineaValorada[];
  total: number | null;
  filename: string;
}): ExportDoc {
  const { resultado: r, lista: lineas, total } = params;
  const tables: ExportTable[] = [];

  if (r.datos && r.datos.length > 0) {
    tables.push({
      name: 'Datos',
      title: 'Datos del cálculo',
      columns: [{ header: 'Dato' }, { header: 'Valor' }],
      rows: r.datos.map((d) => [d.label, d.valor]),
    });
  }

  tables.push({
    name: 'Resumen',
    title: 'Resumen',
    columns: [{ header: 'Concepto' }, { header: 'Valor' }],
    rows: r.resumen.map((x) => [x.label, x.valor]),
  });

  for (const g of r.grupos) {
    tables.push({
      name: g.titulo.slice(0, 31),
      title: g.titulo,
      columns: [{ header: 'Material' }, { header: 'Cantidad', type: 'text' }, { header: 'Unidad' }, { header: 'Detalle' }],
      rows: g.lineas.map((l) => [l.descripcion, String(l.cantidad), l.unidad, l.detalle ?? '']),
    });
  }

  const sinPrecio = lineas.filter((l) => l.precioUnitario == null).length;
  tables.push({
    name: 'Lista de materiales',
    title:
      total != null
        ? `Lista de materiales con precios del catálogo${sinPrecio ? ` (${sinPrecio} sin precio)` : ''}`
        : 'Lista de materiales (sin precios en el catálogo)',
    columns: [
      { header: 'Material' },
      { header: 'Cantidad', type: 'text' },
      { header: 'Unidad' },
      { header: 'Precio unit.', type: 'money' },
      { header: 'Subtotal', type: 'money', total: true },
    ],
    rows: lineas.map((l) => [l.descripcion, String(l.cantidad), l.unidad, l.precioUnitario, l.subtotal]),
    totals: total != null,
  });

  if (r.manoObra.length > 0) {
    tables.push({
      name: 'Cuadrilla',
      title: 'Cuadrilla y tiempo',
      columns: [{ header: 'Actividad' }, { header: 'Cuadrilla' }, { header: 'Rendimiento' }, { header: 'Días', type: 'text' }],
      rows: r.manoObra.map((m) => [m.actividad, m.cuadrilla, m.rendimiento, String(m.dias)]),
    });
  }

  const notas = [
    ...r.notas,
    ...(sinPrecio > 0 && total != null
      ? ['Los materiales sin precio no están enlazados al catálogo o no tienen precio vigente: el total no los incluye.']
      : []),
  ];
  if (notas.length > 0) {
    tables.push({ name: 'Notas', title: 'Notas', columns: [{ header: 'Nota' }], rows: notas.map((n) => [n]), texto: notas.join('\n\n') });
  }

  return {
    title: `Cálculo de materiales — ${params.title}`,
    filters: [
      { label: 'Proyecto', value: params.projectLabel },
      { label: 'Fecha', value: params.fecha },
      { label: 'Calculado por', value: params.autor },
    ],
    tables,
    filename: params.filename,
  };
}
