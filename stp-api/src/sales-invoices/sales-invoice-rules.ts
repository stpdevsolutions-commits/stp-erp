/**
 * Reglas puras de la factura de venta: totales, mapeo a líneas del e-CF y paso de
 * cotización a factura. Sin base de datos, para poder probarlas solas.
 */

export const ITBIS_RATES = [18, 16, 0] as const;

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface DraftLine {
  description: string;
  quantity: number;
  unit: string | null;
  /** Antes de ITBIS. */
  unitPrice: number;
  /** 18, 16 o 0 (exento). */
  itbisRate: number;
  /** 1 = bien, 2 = servicio. */
  goodOrService: number;
}

export interface LineAmounts {
  total: number;
  itbisAmount: number;
}

export function lineAmounts(l: Pick<DraftLine, 'quantity' | 'unitPrice' | 'itbisRate'>): LineAmounts {
  const total = round2(l.quantity * l.unitPrice);
  return { total, itbisAmount: round2((total * l.itbisRate) / 100) };
}

export function invoiceTotals(lines: Pick<DraftLine, 'quantity' | 'unitPrice' | 'itbisRate'>[]) {
  let subtotal = 0;
  let itbis = 0;
  for (const l of lines) {
    const a = lineAmounts(l);
    subtotal += a.total;
    itbis += a.itbisAmount;
  }
  subtotal = round2(subtotal);
  itbis = round2(itbis);
  return { subtotal, itbis, total: round2(subtotal + itbis) };
}

/** Indicador de facturación del e-CF: 1 = ITBIS 18 %, 2 = ITBIS 16 %, 4 = exento. */
export function indicadorFacturacion(itbisRate: number): number {
  if (itbisRate === 18) return 1;
  if (itbisRate === 16) return 2;
  return 4;
}

/** e-CF 31 (crédito fiscal) si el cliente tiene RNC/cédula; si no, 32 (consumo). */
export function tipoEcfFor(clientRnc: string | null | undefined): {
  tipoEcf: string;
  rnc: string | undefined;
} {
  const rnc = (clientRnc ?? '').replace(/\D/g, '');
  return rnc.length >= 9
    ? { tipoEcf: 'e-CF_31_v_1_0', rnc }
    : { tipoEcf: 'e-CF_32_v_1_0', rnc: undefined };
}

// ── Cotización → factura ──────────────────────────────────────────────────────

export interface QuoteItemLike {
  id: string;
  parentId: string | null;
  kind?: string;
  description: string;
  quantity: number;
  unit: string | null;
  total: number;
  sortOrder: number;
}

export interface IndirectCostLike {
  name: string;
  pct: number;
  amount: number;
  kind?: 'itbis';
  taxable?: boolean;
  baseMode?: 'gravables' | 'total';
}

export interface QuoteLike {
  subtotal: number;
  discount?: number | null;
  taxRate?: number | null;
  total: number;
  indirectCosts?: IndirectCostLike[] | null;
  items: QuoteItemLike[];
}

export interface QuoteLines {
  lines: DraftLine[];
  warnings: string[];
}

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : String(round2(n)));

/**
 * Convierte una cotización en líneas de factura, respetando cómo la cotización calcula
 * el ITBIS:
 *  - con gastos indirectos y una entrada de ITBIS "gravables" (lo normal), solo pagan
 *    ITBIS los gastos marcados `taxable` (p. ej. Dirección Técnica); las partidas de
 *    costo directo y los demás gastos van exentas;
 *  - con base "total", todo paga ITBIS;
 *  - cotización antigua (sin gastos indirectos): `taxRate` % sobre todas las partidas.
 *
 * Cada partida de primer nivel sale como UNA línea (cantidad 1) para que la suma sea
 * exacta; las líneas sueltas llevan su cantidad y unidad en la descripción. `percent`
 * factura solo una porción (un avance): todos los importes se multiplican por p/100.
 */
export function quoteToLines(quote: QuoteLike, percent = 100): QuoteLines {
  const warnings: string[] = [];
  const p = percent / 100;
  const subtotal = Number(quote.subtotal) || 0;
  const discount = Number(quote.discount) || 0;
  const base = Math.max(0, subtotal - discount);
  const f = subtotal > 0 ? base / subtotal : 1;

  const costs = Array.isArray(quote.indirectCosts) ? quote.indirectCosts : null;
  const itbisEntry = costs?.find((c) => c.kind === 'itbis');
  let directRate: number;
  let ratesFor: (c: IndirectCostLike) => number;
  if (costs) {
    const rate = itbisEntry ? Number(itbisEntry.pct) || 0 : 0;
    const all = itbisEntry?.baseMode === 'total';
    directRate = all ? rate : 0;
    ratesFor = (c) => (all || c.taxable ? rate : 0);
  } else {
    directRate = Number(quote.taxRate ?? 18) || 0;
    ratesFor = () => 0;
  }
  const safeRate = (r: number): number => {
    if ((ITBIS_RATES as readonly number[]).includes(r)) return r;
    warnings.push(`La tasa de ITBIS ${r}% de la cotización no existe en el e-CF; se usó 18%.`);
    return 18;
  };

  const lines: DraftLine[] = [];
  const roots = quote.items
    .filter((i) => !i.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  for (const it of roots) {
    const isGroup = it.kind === 'group';
    const desc =
      !isGroup && Number(it.quantity) !== 1 && Number(it.quantity) > 0
        ? `${it.description} (${fmtQty(Number(it.quantity))}${it.unit ? ' ' + it.unit : ''})`
        : it.description;
    lines.push({
      description: desc,
      quantity: 1,
      unit: null,
      unitPrice: round2(Number(it.total) * f * p),
      itbisRate: safeRate(directRate),
      goodOrService: 2,
    });
  }
  for (const c of costs ?? []) {
    if (c.kind === 'itbis') continue;
    const amount = Number(c.amount) || 0;
    if (amount <= 0) continue;
    lines.push({
      description: c.name,
      quantity: 1,
      unit: null,
      unitPrice: round2(amount * p),
      itbisRate: safeRate(ratesFor(c)),
      goodOrService: 2,
    });
  }

  const expected = round2(Number(quote.total) * p);
  const got = invoiceTotals(lines).total;
  if (Math.abs(expected - got) > 0.5) {
    warnings.push(
      `El total de la factura (${got.toFixed(2)}) no coincide con el de la cotización (${expected.toFixed(2)}). Revisa las líneas antes de emitir.`,
    );
  }
  return { lines, warnings };
}
