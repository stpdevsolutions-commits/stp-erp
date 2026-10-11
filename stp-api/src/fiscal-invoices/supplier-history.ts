/**
 * Lo que se aprende de las facturas anteriores de un proveedor: su tipo de gasto y su forma
 * de pago habituales. Lógica pura (supplier-history.spec.ts); la consulta vive en el servicio.
 */
import { EXPENSE_TYPE_CODES, PAYMENT_METHOD_CODES } from './fiscal-invoice-rules';

export interface HistoryRow {
  expenseType: string;
  paymentMethod: string;
  invoiceDate: string;
}

export interface Choice {
  value: string;
  /** Cuántas facturas lo tienen. */
  n: number;
  /** Qué parte de las facturas con un valor válido (0–1). */
  share: number;
}

export interface SupplierHistory {
  /** Facturas anteriores de ese proveedor (todas, tengan o no valores válidos). */
  count: number;
  expenseType: Choice | null;
  paymentMethod: Choice | null;
}

/** El valor más frecuente; si empatan, el de la factura más reciente. */
function dominant(rows: { value: string; date: string }[]): Choice | null {
  if (rows.length === 0) return null;
  const by = new Map<string, { n: number; last: string }>();
  for (const r of rows) {
    const e = by.get(r.value) ?? { n: 0, last: '' };
    e.n += 1;
    if (r.date > e.last) e.last = r.date;
    by.set(r.value, e);
  }
  let best: { value: string; n: number; last: string } | null = null;
  for (const [value, e] of by) {
    if (!best || e.n > best.n || (e.n === best.n && e.last > best.last)) best = { value, ...e };
  }
  return best ? { value: best.value, n: best.n, share: best.n / rows.length } : null;
}

/**
 * Resume el historial. Solo cuentan los valores que existen en el catálogo del 606: los
 * '12' y '99' que trae FiscoRD (sin clasificar) no se sugieren como si fueran una decisión.
 */
export function summarizeHistory(rows: HistoryRow[]): SupplierHistory {
  return {
    count: rows.length,
    expenseType: dominant(
      rows.filter((r) => EXPENSE_TYPE_CODES.includes(r.expenseType)).map((r) => ({ value: r.expenseType, date: r.invoiceDate })),
    ),
    paymentMethod: dominant(
      rows.filter((r) => PAYMENT_METHOD_CODES.includes(r.paymentMethod)).map((r) => ({ value: r.paymentMethod, date: r.invoiceDate })),
    ),
  };
}

export interface HistoryApplication {
  expenseType: string | null;
  paymentMethod: string;
  /** Qué campos se tomaron del historial (para decírselo a la persona). */
  applied: ('expenseType' | 'paymentMethod')[];
}

/**
 * Decide si el historial pesa más que lo que ya traía la lectura.
 *
 * - Tipo de gasto: se toma si la lectura no trae ninguno, o si el proveedor tiene al menos 2
 *   facturas y el mismo tipo en la mitad o más de ellas (un hábito, no una casualidad).
 * - Forma de pago: la IA dice "01" cuando no sabe, y eso no es una lectura; con QR no hay
 *   lectura de nada. Se toma el hábito cuando la lectura es "01" (o no hay) y el proveedor
 *   tiene un patrón claro (QR: basta 1 factura; IA: al menos 2 y la mitad o más). Si la factura
 *   dice claramente otra forma de pago (02–07), esa manda sobre la costumbre.
 */
export function applyHistory(
  current: { expenseType: string | null; paymentMethod: string },
  history: SupplierHistory,
  source: 'ia' | 'qr',
): HistoryApplication {
  const applied: HistoryApplication['applied'] = [];
  let expenseType = current.expenseType;
  let paymentMethod = current.paymentMethod;

  const e = history.expenseType;
  if (e && (current.expenseType === null || (e.n >= 2 && e.share >= 0.5)) && e.value !== current.expenseType) {
    expenseType = e.value;
    applied.push('expenseType');
  }

  const p = history.paymentMethod;
  const clearPattern = p ? (source === 'qr' ? p.n >= 1 : p.n >= 2 && p.share >= 0.5) : false;
  if (p && clearPattern && current.paymentMethod === '01' && p.value !== '01') {
    paymentMethod = p.value;
    applied.push('paymentMethod');
  }

  return { expenseType, paymentMethod, applied };
}
