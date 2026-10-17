/**
 * Formato 606 (compras de bienes y servicios) a partir de las facturas fiscales.
 * Lógica pura: sin base de datos ni Nest, para probarla sola (form-606.spec.ts).
 *
 * Portada de `dgii606.ts` / `ReportsPage.tsx` de FiscoRD, con el mismo comportamiento
 * (es lo que el contador ya usa): el monto base va a "servicios" o a "bienes" según el
 * tipo de gasto, y los códigos fuera de catálogo ('12', '99' de facturas migradas) se
 * reportan como tipo 02.
 */
import { EXPENSE_TYPES_606, PAYMENT_METHODS_606, round2 } from './fiscal-invoice-rules';

/** Lo mínimo que se necesita de una factura (la entidad cumple de sobra). */
export interface Invoice606Source {
  ncf: string;
  ncfType: string;
  supplierRnc: string;
  supplierName: string;
  baseAmount: number;
  itbis: number;
  isc: number;
  tip: number;
  otherTax: number;
  totalAmount: number;
  paymentMethod: string;
  expenseType: string;
  invoiceDate: string;
  dgiiEstado?: string | null;
  expense?: { project?: { code: string } | null } | null;
  /** Reparto entre proyectos (ERP-81). Solo informa la columna "Proyecto": los importes no cambian. */
  splits?: { project?: { code: string } | null }[] | null;
}

export interface Row606 {
  rnc: string;
  tipoId: '1' | '2';
  tipoGasto: string;
  descripcionGasto: string;
  ncf: string;
  proveedor: string;
  anomes: string;
  dia: string;
  servicios: number;
  bienes: number;
  itbis: number;
  isc: number;
  otrosImpuestos: number;
  propina: number;
  formaPago: string;
  /** servicios + bienes (el monto base de la factura). */
  totalFacturado: number;
  ncfType: string;
  totalGeneral: number;
  estadoDgii: string;
  /**
   * Código del proyecto, o 'General' si es un gasto general de la empresa. Una factura dividida
   * (ERP-81) lista los destinos separados por coma; la factura sigue entera en el resto de columnas.
   */
  proyecto: string;
}

/** '1' = RNC (hasta 9 dígitos), '2' = cédula (11). */
export function tipoId(rnc: string): '1' | '2' {
  return (rnc ?? '').replace(/\D/g, '').length <= 9 ? '1' : '2';
}

/** Tipos de gasto 09 (costo de venta) y 10 (activos) son "bienes"; el resto, "servicios". */
export function esBienes(tipo: string): boolean {
  const t = parseInt(tipo, 10);
  return t === 9 || t === 10;
}

/** El código que va al 606: los de catálogo tal cual; cualquier otro ('12', '99'…) → '02'. */
export function tipo606(code: string): string {
  return EXPENSE_TYPES_606[code] ? code : '02';
}

/** '2026-10-05' → { anomes: '202610', dia: '05' }. */
export function fechaParts(date: string | null | undefined): { anomes: string; dia: string } {
  if (!date) return { anomes: '', dia: '' };
  const clean = date.slice(0, 10).replace(/-/g, '');
  return { anomes: clean.slice(0, 6), dia: clean.slice(6, 8) };
}

/** Columna "Proyecto": el del gasto, 'General', o los destinos del reparto. */
function proyecto606(inv: Invoice606Source): string {
  if (inv.splits && inv.splits.length > 0) {
    return [...new Set(inv.splits.map((s) => s.project?.code ?? 'General'))].join(', ');
  }
  return inv.expense?.project?.code ?? 'General';
}

export function toRow606(inv: Invoice606Source): Row606 {
  const tipo = tipo606(inv.expenseType);
  const base = round2(Number(inv.baseAmount));
  const { anomes, dia } = fechaParts(inv.invoiceDate);
  return {
    rnc: inv.supplierRnc,
    tipoId: tipoId(inv.supplierRnc),
    tipoGasto: tipo,
    descripcionGasto: EXPENSE_TYPES_606[tipo] ?? '',
    ncf: inv.ncf,
    proveedor: inv.supplierName,
    anomes,
    dia,
    servicios: esBienes(tipo) ? 0 : base,
    bienes: esBienes(tipo) ? base : 0,
    itbis: round2(Number(inv.itbis ?? 0)),
    isc: round2(Number(inv.isc ?? 0)),
    otrosImpuestos: round2(Number(inv.otherTax ?? 0)),
    propina: round2(Number(inv.tip ?? 0)),
    formaPago: inv.paymentMethod,
    totalFacturado: base,
    ncfType: inv.ncfType,
    totalGeneral: round2(Number(inv.totalAmount)),
    estadoDgii: inv.dgiiEstado ?? '',
    proyecto: proyecto606(inv),
  };
}

/** Entradas de un catálogo ordenadas por código ("10" y "11" saldrían antes que "01" sin esto). */
const porCodigo = (c: Record<string, string>) =>
  Object.entries(c).sort(([a], [b]) => a.localeCompare(b));

/** Catálogos que acompañan al Excel, para que el contador no tenga que buscarlos. */
export const CATALOGOS_606: { catalogo: string; codigo: string; descripcion: string }[] = [
  ...porCodigo(EXPENSE_TYPES_606).map(([codigo, descripcion]) => ({
    catalogo: 'Col 3 — Tipo de bienes y servicios comprados',
    codigo,
    descripcion,
  })),
  ...porCodigo(PAYMENT_METHODS_606).map(([codigo, descripcion]) => ({
    catalogo: 'Col 23 — Forma de pago',
    codigo,
    descripcion,
  })),
  { catalogo: 'Col 2 — Tipo de identificación', codigo: '1', descripcion: 'RNC (persona jurídica, hasta 9 dígitos)' },
  { catalogo: 'Col 2 — Tipo de identificación', codigo: '2', descripcion: 'Cédula (persona física, 11 dígitos)' },
];
