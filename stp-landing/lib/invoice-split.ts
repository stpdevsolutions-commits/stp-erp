/**
 * Reparto de una factura entre proyectos y gasto general (ERP-81). Lógica pura: sin base de
 * datos ni Nest. COPIA IDÉNTICA de stp-api/src/fiscal-invoices/invoice-split.ts (donde están sus pruebas
 * unitarias) para el diálogo "Dividir factura": si cambia una, cambia la otra.
 *
 * Todo se calcula en CÉNTIMOS enteros: así 0.1 + 0.2 o 1.005 nunca arrastran error de coma flotante.
 */

/** Una línea del reparto: a dónde va (proyecto, o `null` = gasto general) y cuánto. */
export interface SplitLine {
  projectId: string | null;
  amount: number;
  note?: string | null;
}

/** RD$ 1,234.50 → 123450. Redondea al céntimo más cercano. */
export function toCents(amount: number): number {
  return Math.round((Number(amount) + Number.EPSILON * Math.sign(amount)) * 100);
}

/** 123450 → 1234.5. */
export function fromCents(cents: number): number {
  return cents / 100;
}

/** Suma exacta de los montos (en RD$, redondeada al céntimo). */
export function sumAmounts(amounts: number[]): number {
  return fromCents(amounts.reduce((acc, a) => acc + toCents(a), 0));
}

export interface SplitCheck {
  /** `true` si la suma de las líneas es exactamente el total de la factura. */
  ok: boolean;
  /** Suma de las líneas. */
  sum: number;
  /** total − suma: positivo = FALTA repartir, negativo = SOBRA. */
  difference: number;
}

/** Compara la suma de las líneas con el total de la factura (al céntimo). */
export function checkSplit(total: number, lines: Pick<SplitLine, 'amount'>[]): SplitCheck {
  const diffCents = toCents(total) - lines.reduce((acc, l) => acc + toCents(l.amount), 0);
  return {
    ok: diffCents === 0,
    sum: sumAmounts(lines.map((l) => l.amount)),
    difference: fromCents(diffCents),
  };
}

/** Frase para el usuario: "Falta RD$ 50.00", "Sobra RD$ 0.01" o "Cuadra". */
export function describeDifference(difference: number): string {
  const cents = toCents(difference);
  if (cents === 0) return 'Cuadra';
  const money = `RD$ ${Math.abs(fromCents(cents)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return cents > 0 ? `Falta ${money}` : `Sobra ${money}`;
}

const destinationKey = (projectId: string | null) => projectId ?? '__general__';

/**
 * Regla de duplicados: el mismo destino (el mismo proyecto, o "gasto general") NO se repite; si
 * viene dos veces se FUSIONA en una sola línea con la suma de los montos y las notas unidas.
 * Conserva el orden de la primera aparición de cada destino.
 */
export function mergeSplitLines(lines: SplitLine[]): SplitLine[] {
  const merged = new Map<string, { projectId: string | null; cents: number; notes: string[] }>();
  for (const line of lines) {
    const key = destinationKey(line.projectId);
    const entry = merged.get(key) ?? { projectId: line.projectId, cents: 0, notes: [] };
    entry.cents += toCents(line.amount);
    const note = line.note?.trim();
    if (note && !entry.notes.includes(note)) entry.notes.push(note);
    merged.set(key, entry);
  }
  return [...merged.values()].map((e) => ({
    projectId: e.projectId,
    amount: fromCents(e.cents),
    note: e.notes.length > 0 ? e.notes.join('; ') : null,
  }));
}

/**
 * Parte `total` en `parts` montos iguales. Si no divide exacto, los céntimos que sobran se
 * reparten de a uno a las PRIMERAS líneas (nunca se pierde ni se inventa un céntimo).
 */
export function splitEqually(total: number, parts: number): number[] {
  if (!Number.isInteger(parts) || parts < 1) throw new Error('Las partes deben ser un entero mayor que 0');
  const totalCents = toCents(total);
  const base = Math.trunc(totalCents / parts);
  const extra = totalCents - base * parts; // céntimos sueltos, 0 <= extra < parts (con total >= 0)
  return Array.from({ length: parts }, (_, i) => fromCents(base + (i < extra ? 1 : 0)));
}

/**
 * Reparte `total` según porcentajes (hasta 2 decimales cada uno). Cada monto es
 * total × % redondeado al céntimo, y la ÚLTIMA línea absorbe la diferencia de redondeo para que
 * la suma sea exactamente el total. Los porcentajes deben sumar 100.
 */
export function splitByPercent(total: number, percents: number[]): number[] {
  if (percents.length === 0) throw new Error('Indica al menos un porcentaje');
  const basisPoints = percents.map((p) => Math.round(Number(p) * 100));
  if (basisPoints.some((b) => !Number.isFinite(b) || b < 0)) throw new Error('Los porcentajes no pueden ser negativos');
  if (basisPoints.reduce((a, b) => a + b, 0) !== 10000) throw new Error('Los porcentajes deben sumar 100%');
  const totalCents = toCents(total);
  const cents = basisPoints.map((b) => Math.round((totalCents * b) / 10000));
  const head = cents.slice(0, -1).reduce((a, b) => a + b, 0);
  cents[cents.length - 1] = totalCents - head;
  return cents.map(fromCents);
}

/**
 * Montos para lo que el usuario va tecleando en "Por porcentaje": si los porcentajes ya suman 100 se
 * reparte exacto (la última línea absorbe el céntimo); mientras no suman 100 cada monto es solo
 * total × % redondeado, sin forzar nada, para que el indicador "Falta/Sobra" diga cuánto resta.
 * Un porcentaje vacío o inválido cuenta como 0.
 */
export function amountsForPercents(total: number, percents: number[]): number[] {
  const bps = percents.map((p) => (Number.isFinite(p) && p > 0 ? Math.round(p * 100) : 0));
  if (bps.length > 0 && bps.reduce((a, b) => a + b, 0) === 10000) return splitByPercent(total, bps.map((b) => b / 100));
  const totalCents = toCents(total);
  return bps.map((b) => fromCents(Math.round((totalCents * b) / 10000)));
}

/** Lo que falta para completar el total, si se dejara fuera la línea `index` (para "lo que falta va a esta línea"). */
export function remainderFor(total: number, amounts: number[], index: number): number {
  const others = amounts.reduce((acc, a, i) => (i === index ? acc : acc + toCents(a)), 0);
  return fromCents(toCents(total) - others);
}
