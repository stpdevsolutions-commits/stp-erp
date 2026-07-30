/**
 * Lógica pura del módulo de costos: normalización de nombres, cálculo del precio
 * comparable y selección del precio vigente. Sin dependencias de TypeORM ni de Nest
 * para que sea testeable sola (ver `price-selection.spec.ts`), igual que
 * `quotes/quote-revision.ts`.
 */

/**
 * Nombre canónico para detectar el mismo material escrito de formas distintas.
 * "Cable THHN #12 (Phelps Dodge)" y "cable  thhn  #12 phelps dodge" colapsan al mismo texto.
 * NO intenta ser inteligente: solo quita ruido tipográfico. El emparejamiento semántico
 * ("alambre" == "cable") es un problema aparte y posterior.
 */
export function normalizeMaterialName(raw: string): string {
  return (raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // acentos (marcas diacríticas combinantes)
    .toLowerCase()
    .replace(/[^a-z0-9#/.\s-]/g, ' ') // conserva #, /, . y - (calibres, medidas)
    .replace(/\s+/g, ' ')
    .trim();
}

export interface NetPriceInput {
  price: number;
  currency: string;
  exchangeRate?: number | null;
  itbisIncluded?: boolean;
  itbisRate?: number | null;
  discountPct?: number | null;
}

/**
 * Precio comparable: DOP, con descuento aplicado y sin ITBIS.
 * Es el único valor que deben promediar/comparar las consultas — el `price` crudo mezcla
 * monedas y bases de impuesto, así que promediarlo da un número sin significado.
 */
export function computeNetUnitPrice(input: NetPriceInput): number {
  const { price, currency } = input;
  if (!Number.isFinite(price) || price < 0) {
    throw new Error('price debe ser un número >= 0');
  }

  const rate = currency === 'DOP' ? 1 : (input.exchangeRate ?? 0);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`exchangeRate es obligatorio y > 0 para la moneda ${currency}`);
  }

  const discountPct = input.discountPct ?? 0;
  if (discountPct < 0 || discountPct >= 100) {
    throw new Error('discountPct debe estar en [0, 100)');
  }

  const itbisRate = input.itbisIncluded ? (input.itbisRate ?? 0) : 0;
  if (itbisRate < 0) throw new Error('itbisRate no puede ser negativo');

  const inDop = price * rate;
  const afterDiscount = inDop * (1 - discountPct / 100);
  const withoutItbis = afterDiscount / (1 + itbisRate / 100);

  // 4 decimales: hay materiales cuyo unitario real tiene céntimos (cable por metro,
  // tornillería por unidad) y redondear a 2 introduce sesgo al multiplicar por cantidades.
  return Math.round(withoutItbis * 1e4) / 1e4;
}

export interface PriceLike {
  id: string;
  supplierId?: string | null;
  netUnitPrice: number;
  /** ISO `YYYY-MM-DD`. */
  date: string;
  createdAt: Date | string;
  voidedAt?: Date | string | null;
}

function ts(v: Date | string): number {
  return v instanceof Date ? v.getTime() : new Date(v).getTime();
}

/** Más reciente primero: por fecha de vigencia y, a igual fecha, por orden de captura. */
function byRecencyDesc(a: PriceLike, b: PriceLike): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return ts(b.createdAt) - ts(a.createdAt);
}

export function activePrices<T extends PriceLike>(prices: T[]): T[] {
  return prices.filter((p) => !p.voidedAt);
}

/**
 * Precio vigente: el más reciente no anulado. `null` si el material no tiene ninguno
 * (caso normal al arrancar: el catálogo puede existir antes que los precios).
 */
export function pickCurrentPrice<T extends PriceLike>(prices: T[]): T | null {
  const active = activePrices(prices);
  if (active.length === 0) return null;
  return [...active].sort(byRecencyDesc)[0];
}

/** Precio vigente de cada proveedor, del más barato al más caro. */
export function currentPriceBySupplier<T extends PriceLike>(prices: T[]): T[] {
  const bySupplier = new Map<string, T[]>();
  for (const p of activePrices(prices)) {
    const key = p.supplierId ?? '__sin_proveedor__';
    const bucket = bySupplier.get(key);
    if (bucket) bucket.push(p);
    else bySupplier.set(key, [p]);
  }

  return [...bySupplier.values()]
    .map((bucket) => [...bucket].sort(byRecencyDesc)[0])
    .sort((a, b) => a.netUnitPrice - b.netUnitPrice);
}

export interface PriceSummary {
  count: number;
  current: number | null;
  currentDate: string | null;
  min: number | null;
  max: number | null;
  avg: number | null;
  /** Variación % del vigente contra el precio inmediatamente anterior. */
  changePct: number | null;
  /** Días desde la fecha de vigencia del precio actual. Alto = precio viejo, no confiar. */
  ageDays: number | null;
}

export function summarizePrices(prices: PriceLike[], today = new Date()): PriceSummary {
  const active = activePrices(prices);
  const empty: PriceSummary = {
    count: 0,
    current: null,
    currentDate: null,
    min: null,
    max: null,
    avg: null,
    changePct: null,
    ageDays: null,
  };
  if (active.length === 0) return empty;

  const sorted = [...active].sort(byRecencyDesc);
  const current = sorted[0];
  const previous = sorted[1];
  const values = active.map((p) => p.netUnitPrice);
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const changePct =
    previous && previous.netUnitPrice > 0
      ? round2(((current.netUnitPrice - previous.netUnitPrice) / previous.netUnitPrice) * 100)
      : null;

  const dayMs = 86_400_000;
  const ageDays = Math.max(
    0,
    Math.floor((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) -
      new Date(`${current.date}T00:00:00Z`).getTime()) / dayMs),
  );

  return {
    count: active.length,
    current: current.netUnitPrice,
    currentDate: current.date,
    min: round2(Math.min(...values)),
    max: round2(Math.max(...values)),
    avg: round2(values.reduce((a, b) => a + b, 0) / values.length),
    changePct,
    ageDays,
  };
}
