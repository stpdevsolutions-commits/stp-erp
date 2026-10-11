/**
 * Conciliación de facturas con gastos ya registrados a mano (ERP-50).
 *
 * Una factura nueva (o una migrada de FiscoRD) puede corresponder a un gasto que alguien ya
 * tecleó en Gastos. Aquí se puntúa qué tan probable es: mismo proveedor, monto y fecha parecidos.
 * Son funciones puras: la consulta a la base y el enlace van en el servicio.
 */

export interface MatchInvoice {
  id?: string;
  supplierRnc: string;
  supplierName: string;
  totalAmount: number;
  baseAmount?: number;
  /** 'YYYY-MM-DD' */
  invoiceDate: string;
}

export interface MatchExpense {
  id: string;
  description: string;
  amount: number;
  /** 'YYYY-MM-DD' */
  date: string;
  notes?: string | null;
  supplierRnc?: string | null;
  supplierName?: string | null;
}

export type MatchLevel = 'strong' | 'possible';

export interface ExpenseMatch {
  expenseId: string;
  score: number;
  level: MatchLevel;
  reasons: string[];
}

/** Por debajo de esto no se sugiere: sería ruido. */
export const MIN_SCORE = 45;
/** Ventana de fechas en la que se busca un gasto (días antes y después de la factura). */
export const DATE_WINDOW_DAYS = 30;

const STOPWORDS = new Set([
  'srl', 'sas', 'sa', 'eirl', 'ltd', 'cia', 'co', 'corp', 'inc', 'de', 'del', 'la', 'el', 'los', 'las', 'y', 'e',
  'rd', 'dominicana', 'dominicano', 'republica', 'compra', 'pago', 'factura', 'sucursal',
]);

/** Minúsculas, sin acentos ni signos. */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Palabras que distinguen a un proveedor de otro (sin "SRL", "de", etc.). */
export function distinctiveTokens(name: string): string[] {
  return normalizeText(name)
    .split(' ')
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** ¿El texto del gasto nombra al proveedor? Con que aparezca la mitad de sus palabras clave alcanza. */
export function namesLookAlike(supplierName: string, text: string): boolean {
  const tokens = distinctiveTokens(supplierName);
  if (tokens.length === 0) return false;
  const haystack = ` ${normalizeText(text)} `;
  const hits = tokens.filter((t) => haystack.includes(` ${t} `) || haystack.includes(` ${t}`)).length;
  return hits >= 1 && hits / tokens.length >= 0.5;
}

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

/** Días de diferencia entre dos 'YYYY-MM-DD'. */
export function daysApart(a: string, b: string): number {
  const t = (d: string) => {
    const [y, m, day] = d.slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.abs(Math.round((t(a) - t(b)) / 86_400_000));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Puntúa un gasto contra una factura; `null` si no se parecen lo bastante. */
export function scoreExpense(inv: MatchInvoice, exp: MatchExpense): ExpenseMatch | null {
  const reasons: string[] = [];
  let score = 0;

  // Proveedor.
  let supplierPts = 0;
  if (digits(exp.supplierRnc) && digits(exp.supplierRnc) === digits(inv.supplierRnc)) {
    supplierPts = 40;
    reasons.push('mismo proveedor');
  } else if (
    namesLookAlike(inv.supplierName, `${exp.supplierName ?? ''} ${exp.description} ${exp.notes ?? ''}`)
  ) {
    supplierPts = 25;
    reasons.push('nombre del proveedor parecido');
  }
  score += supplierPts;

  // Monto: contra el total de la factura y, si el gasto se tecleó sin ITBIS, contra la base.
  let amountPts = 0;
  const diffTotal = Math.abs(round2(exp.amount - inv.totalAmount));
  const tolerance = Math.max(1, inv.totalAmount * 0.005);
  if (diffTotal <= 0.01) {
    amountPts = 40;
    reasons.push('mismo monto');
  } else if (diffTotal <= tolerance) {
    amountPts = 30;
    reasons.push('monto casi igual');
  } else if (inv.baseAmount && Math.abs(round2(exp.amount - inv.baseAmount)) <= 0.01) {
    amountPts = 30;
    reasons.push('igual a la base sin ITBIS');
  } else if (diffTotal <= inv.totalAmount * 0.05) {
    amountPts = 8;
    reasons.push('monto parecido');
  }
  score += amountPts;

  // Fecha.
  const days = daysApart(exp.date, inv.invoiceDate);
  if (days <= 3) {
    score += 20;
    reasons.push(days === 0 ? 'misma fecha' : `a ${days} día${days === 1 ? '' : 's'}`);
  } else if (days <= 10) {
    score += 12;
    reasons.push(`a ${days} días`);
  } else if (days <= DATE_WINDOW_DAYS) {
    score += 4;
    reasons.push(`a ${days} días`);
  }

  // Sin monto ni proveedor que lo respalde no se sugiere, aunque la fecha coincida.
  if (supplierPts === 0 && amountPts < 8) return null;
  if (score < MIN_SCORE) return null;

  const strong = supplierPts > 0 && amountPts >= 30 && days <= 10;
  return { expenseId: exp.id, score, level: strong ? 'strong' : 'possible', reasons };
}

/** Los mejores gastos para una factura, del más al menos probable. */
export function matchExpenses(inv: MatchInvoice, expenses: MatchExpense[], limit = 5): ExpenseMatch[] {
  return expenses
    .map((e) => scoreExpense(inv, e))
    .filter((m): m is ExpenseMatch => m !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export interface Suggestion {
  invoiceId: string;
  /** El gasto que se propone para esta factura (cada gasto se propone a una sola factura). */
  best: ExpenseMatch;
  /** Hay otro gasto casi igual de probable: conviene revisarla antes de confirmar. */
  ambiguous: boolean;
  /** Otros gastos posibles, por si el propuesto no es. */
  alternatives: ExpenseMatch[];
}

/**
 * Propone un gasto por factura sin repetir ninguno: las coincidencias más seguras se reparten
 * primero. `ambiguous` marca las que tenían un rival casi igual de bueno.
 */
export function suggestAll(invoices: Array<MatchInvoice & { id: string }>, expenses: MatchExpense[]): Suggestion[] {
  const perInvoice = new Map<string, ExpenseMatch[]>();
  const pairs: Array<{ invoiceId: string; match: ExpenseMatch }> = [];
  for (const inv of invoices) {
    const matches = matchExpenses(inv, expenses, 5);
    if (matches.length === 0) continue;
    perInvoice.set(inv.id, matches);
    for (const match of matches) pairs.push({ invoiceId: inv.id, match });
  }

  pairs.sort((a, b) => b.match.score - a.match.score);
  const takenExpense = new Set<string>();
  const assigned = new Map<string, ExpenseMatch>();
  for (const { invoiceId, match } of pairs) {
    if (assigned.has(invoiceId) || takenExpense.has(match.expenseId)) continue;
    assigned.set(invoiceId, match);
    takenExpense.add(match.expenseId);
  }

  const out: Suggestion[] = [];
  for (const [invoiceId, best] of assigned) {
    const all = perInvoice.get(invoiceId) ?? [];
    const rivals = all.filter((m) => m.expenseId !== best.expenseId);
    const topRival = rivals[0];
    out.push({
      invoiceId,
      best,
      ambiguous: !!topRival && topRival.level === best.level && best.score - topRival.score < 10,
      alternatives: rivals.slice(0, 3),
    });
  }
  return out.sort((a, b) => b.best.score - a.best.score);
}
