/**
 * Reglas puras de las facturas fiscales (comprobantes de compra del Formato 606).
 * Sin base de datos ni Nest: se prueban solas (fiscal-invoice-rules.spec.ts) y las
 * comparten el DTO, el servicio y, más adelante, la importación de FiscoRD.
 */

/** Tipos de comprobante: B = papel, E = electrónico (e-CF). */
export const NCF_TYPES = [
  'B01', 'B02', 'B03', 'B04', 'B11', 'B13', 'B14', 'B15', 'B16', 'B17',
  'E31', 'E32', 'E33', 'E34', 'E41', 'E43', 'E44', 'E45', 'E46', 'E47',
] as const;
export type NcfType = (typeof NCF_TYPES)[number];

/** B + tipo (2) + secuencia (8) = 11 caracteres. */
export const NCF_PAPER = /^B(01|02|03|04|11|13|14|15|16|17)\d{8}$/;
/** E + tipo (2) + secuencia (10) = 13 caracteres. */
export const NCF_ELECTRONIC = /^E(31|32|33|34|41|43|44|45|46|47)\d{10}$/;

/** Quita espacios y guiones y pasa a mayúsculas: "b01-00000012" → "B0100000012". */
export function normalizeNcf(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

export function isValidNcf(ncf: string): boolean {
  return NCF_PAPER.test(ncf) || NCF_ELECTRONIC.test(ncf);
}

/** El tipo sale de las 3 primeras letras del propio NCF, no se pide aparte. */
export function ncfTypeOf(ncf: string): NcfType | null {
  if (!isValidNcf(ncf)) return null;
  return ncf.slice(0, 3) as NcfType;
}

/** Solo dígitos: "1-30-99187-3" → "130991873". */
export function normalizeRnc(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** 9 dígitos (empresa) u 11 (cédula). */
export function isValidRnc(rnc: string): boolean {
  return /^(\d{9}|\d{11})$/.test(rnc);
}

/** Tipo de gasto del 606 (campo "Tipo de Bienes y Servicios Comprados"). */
export const EXPENSE_TYPES_606: Record<string, string> = {
  '01': 'Gastos de personal',
  '02': 'Gastos por trabajos, suministros y servicios',
  '03': 'Arrendamientos',
  '04': 'Gastos de activos fijos',
  '05': 'Gastos de representación',
  '06': 'Otras deducciones admitidas',
  '07': 'Gastos financieros',
  '08': 'Gastos extraordinarios',
  '09': 'Compras y gastos que formarán parte del costo de venta',
  '10': 'Adquisiciones de activos',
  '11': 'Gastos de seguros',
};

/** Forma de pago del 606. */
export const PAYMENT_METHODS_606: Record<string, string> = {
  '01': 'Efectivo',
  '02': 'Cheque, transferencia o depósito',
  '03': 'Tarjeta de crédito o débito',
  '04': 'Compra a crédito',
  '05': 'Permuta',
  '06': 'Notas de crédito',
  '07': 'Mixto',
};

// `sort()`: en JS las claves "10" y "11" se enumeran antes que "01"… ("01" no es un
// índice canónico), así que sin ordenar saldrían primero en cualquier lista.
export const EXPENSE_TYPE_CODES = Object.keys(EXPENSE_TYPES_606).sort();
export const PAYMENT_METHOD_CODES = Object.keys(PAYMENT_METHODS_606).sort();

/**
 * Categoría del gasto del ERP que origina una factura, según su tipo del 606:
 * 09 (costo de venta) = materiales, 10 (activos) = equipos, 01 (personal) = mano de
 * obra; el resto, otro. Es solo la sugerencia inicial: el gasto se puede editar.
 */
export function expenseCategoryFor(expenseType: string): 'materials' | 'equipment' | 'labor' | 'other' {
  if (expenseType === '09') return 'materials';
  if (expenseType === '10') return 'equipment';
  if (expenseType === '01') return 'labor';
  return 'other';
}

/** Redondea a 2 decimales sin arrastrar el error de coma flotante (1.005 → 1.01). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface FiscalAmounts {
  baseAmount: number;
  itbis?: number | null;
  isc?: number | null;
  tip?: number | null;
  otherTax?: number | null;
}

/** Total = base + ITBIS + ISC + propina + otros impuestos. */
export function invoiceTotal(a: FiscalAmounts): number {
  return round2(
    (a.baseAmount ?? 0) + (a.itbis ?? 0) + (a.isc ?? 0) + (a.tip ?? 0) + (a.otherTax ?? 0),
  );
}
