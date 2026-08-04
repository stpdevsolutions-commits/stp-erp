/**
 * Puente entre el ACU (receta con precios reales) y la cotización.
 *
 * Es la contrapartida deliberada del diseño del ACU: allí el costo NO se guarda y se
 * recalcula siempre, porque un unitario congelado envejece en silencio. Aquí pasa lo
 * contrario **a propósito**: en cuanto una línea de cotización nace de un ACU, su
 * unitario se CONGELA. Una cotización enviada a un cliente no puede cambiar de precio
 * sola; sería un documento distinto del que el cliente recibió.
 *
 * Lo que sí se hace es AVISAR: comparar el costo congelado con el costo de hoy y decir
 * cuánto se ha desfasado. Actualizar es siempre una decisión humana y explícita.
 *
 * Todo este archivo es puro (sin TypeORM ni Nest), igual que `quote-tree.ts`,
 * `acu-cost.ts` y `price-selection.ts`.
 */

import { lineTotal } from './quote-tree';

/**
 * Umbral por debajo del cual una diferencia de costo no es noticia: un céntimo.
 * El costo del ACU se calcula a 4 decimales, así que dos cálculos del mismo día pueden
 * diferir en la última cifra sin que nada haya cambiado de verdad.
 */
export const ACU_COST_EPSILON = 0.01;

/**
 * A partir de aquí el congelado se considera VIEJO aunque el costo no haya cambiado.
 * Mismo criterio que el aviso de precios de material sin actualizar: un precio de hace
 * meses no es que esté mal, es que nadie sabe si sigue bien.
 */
export const ACU_FREEZE_AGE_DAYS = 90;

const round2 = (v: number): number =>
  Math.round(Number((v || 0).toPrecision(12)) * 100) / 100;

const round4 = (v: number): number =>
  Math.round(Number((v || 0).toPrecision(12)) * 1e4) / 1e4;

const num = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

/**
 * Precio de venta a partir del costo directo del ACU.
 *
 * El margen es un dato de la LÍNEA, no del ACU: la misma partida se cotiza con margen
 * distinto según el cliente y la obra. Guardarlo aparte del unitario es lo que permite
 * después comparar costo contra costo en vez de mezclar margen y desfase de precios.
 */
export function applyMarkup(directCost: number, markupPct?: number | null): number {
  const cost = Math.max(0, num(directCost));
  const markup = Math.max(0, num(markupPct));
  return round2(cost * (1 + markup / 100));
}

/** Lo que queda congelado en `quote_items` cuando la línea nace de un ACU. */
export interface AcuFreeze {
  acuId: string;
  /** Costo directo del ACU en el momento de congelar (4 decimales). */
  acuUnitCost: number;
  /** Margen aplicado sobre ese costo para obtener el precio de venta. */
  acuMarkupPct: number;
  acuPricedAt: Date;
  /**
   * El ACU estaba incompleto al congelar (algún material sin precio vigente), así que
   * el unitario es un PISO, no el costo real. Se guarda para que el aviso siga vivo:
   * un dato malo no deja de serlo porque se haya guardado.
   */
  acuIncomplete: boolean;
}

/** Costo del ACU tal como lo devuelve hoy `computeAcuCost`. */
export interface CurrentAcuCost {
  directCost: number;
  incomplete: boolean;
  missingMaterialIds?: string[];
}

/** Línea de cotización ya congelada, tal como vive en `quote_items`. */
export interface FrozenAcuLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPct?: number | null;
  acuId: string;
  acuUnitCost?: number | null;
  acuMarkupPct?: number | null;
  acuPricedAt?: Date | string | null;
  acuIncomplete?: boolean | null;
}

/** Por qué una línea aparece en el aviso. Ninguna es excluyente de las otras. */
export interface AcuDriftFlags {
  /** El costo de hoy difiere del congelado por más de un céntimo. */
  costChanged: boolean;
  /** El ACU está incompleto HOY: el costo actual es un piso, no una comparación firme. */
  currentIncomplete: boolean;
  /** Ya estaba incompleto cuando se congeló: el unitario cotizado nunca fue completo. */
  frozenIncomplete: boolean;
  /** Se congeló hace más de `ACU_FREEZE_AGE_DAYS` días. */
  aged: boolean;
  /**
   * El unitario guardado no cuadra con `costo congelado × (1 + margen)`: alguien lo
   * escribió a mano después. No es un error — es información para no pisarlo sin querer.
   */
  manualOverride: boolean;
  /**
   * La línea apunta a un ACU pero no guarda el costo congelado (o el ACU ya no existe):
   * no hay contra qué comparar. Se avisa en vez de asumir que está al día.
   */
  noBaseline: boolean;
}

export interface AcuDriftLine {
  itemId: string;
  description: string;
  acuId: string;

  // Campos de presentación que rellena el servicio (aquí no hay acceso a la base):
  // sirven para señalar la línea en la cotización sin que el frontend tenga que cruzar
  // el árbol ni pedir cada ACU por separado.
  /** Numeración jerárquica de la línea en el árbol de partidas ("1.2.3"). */
  label?: string;
  acuCode?: string;
  acuName?: string;

  quantity: number;
  discountPct: number;

  /** Costo directo congelado y costo directo de hoy. `null` si no hay con qué comparar. */
  frozenUnitCost: number | null;
  currentUnitCost: number | null;
  unitCostDelta: number | null;
  /** Variación porcentual del costo. `null` si el congelado era 0 (no se divide entre 0). */
  unitCostDeltaPct: number | null;

  markupPct: number;
  /** Unitario que hoy tiene la cotización (el congelado, con su margen). */
  currentUnitPrice: number;
  /** Unitario que saldría de rehacer el congelado hoy, con el MISMO margen. */
  suggestedUnitPrice: number | null;
  unitPriceDelta: number | null;

  /** Total de la línea con el precio de la cotización y con el sugerido. */
  currentLineTotal: number;
  suggestedLineTotal: number | null;
  lineTotalDelta: number | null;

  direction: 'up' | 'down' | 'same' | 'unknown';
  pricedAt: Date | null;
  ageDays: number | null;
  /** Hay algo que mirar en esta línea (cualquier flag activo). */
  stale: boolean;
  flags: AcuDriftFlags;
}

export interface AcuDriftSummary {
  /** Líneas de la cotización enlazadas a un ACU. */
  linkedLines: number;
  /** De ellas, cuántas traen aviso. */
  staleLines: number;
  incompleteLines: number;
  /** Suma de los totales de las líneas enlazadas, tal como está cotizado hoy. */
  currentTotal: number;
  /** La misma suma si se rehiciera el congelado con los costos de hoy. */
  suggestedTotal: number;
  totalDelta: number;
  /** Variación porcentual sobre `currentTotal`. `null` si ese total es 0. */
  totalDeltaPct: number | null;
  /** Mayor variación de costo encontrada, en valor absoluto (para ordenar el aviso). */
  maxDeltaPct: number | null;
}

export interface AcuDriftReport extends AcuDriftSummary {
  lines: AcuDriftLine[];
  generatedAt: Date;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

/**
 * Compara UNA línea congelada con el costo actual de su ACU.
 *
 * `current` es `null` cuando el ACU ya no se puede valorar (fue borrado o no se pudo
 * cargar). En ese caso no se inventa una comparación: la línea sale marcada
 * `noBaseline` para que alguien la mire, nunca como "al día".
 */
export function compareAcuLine(
  line: FrozenAcuLine,
  current: CurrentAcuCost | null,
  now: Date = new Date(),
): AcuDriftLine {
  const quantity = num(line.quantity);
  const discountPct = num(line.discountPct);
  const markupPct = num(line.acuMarkupPct);
  const currentUnitPrice = num(line.unitPrice);
  const currentLineTotal = lineTotal({ quantity, unitPrice: currentUnitPrice, discountPct });

  const frozenUnitCost =
    line.acuUnitCost != null && Number.isFinite(line.acuUnitCost)
      ? round4(line.acuUnitCost)
      : null;
  const currentUnitCost = current ? round4(current.directCost) : null;

  const pricedAt = toDate(line.acuPricedAt);
  const ageDays = pricedAt ? daysBetween(pricedAt, now) : null;

  const hasBaseline = frozenUnitCost !== null && currentUnitCost !== null;
  const unitCostDelta = hasBaseline ? round4(currentUnitCost - frozenUnitCost) : null;
  const unitCostDeltaPct =
    unitCostDelta !== null && frozenUnitCost !== null && frozenUnitCost !== 0
      ? round2((unitCostDelta / frozenUnitCost) * 100)
      : null;

  const suggestedUnitPrice =
    currentUnitCost !== null ? applyMarkup(currentUnitCost, markupPct) : null;
  const unitPriceDelta =
    suggestedUnitPrice !== null ? round2(suggestedUnitPrice - currentUnitPrice) : null;
  const suggestedLineTotal =
    suggestedUnitPrice !== null
      ? lineTotal({ quantity, unitPrice: suggestedUnitPrice, discountPct })
      : null;
  const lineTotalDelta =
    suggestedLineTotal !== null ? round2(suggestedLineTotal - currentLineTotal) : null;

  // El unitario cotizado debería ser el congelado con su margen. Si no lo es, se tocó a
  // mano: se avisa, no se corrige.
  const expectedFromFreeze =
    frozenUnitCost !== null ? applyMarkup(frozenUnitCost, markupPct) : null;
  const manualOverride =
    expectedFromFreeze !== null &&
    Math.abs(expectedFromFreeze - currentUnitPrice) >= ACU_COST_EPSILON;

  const costChanged =
    unitCostDelta !== null && Math.abs(unitCostDelta) >= ACU_COST_EPSILON;

  const flags: AcuDriftFlags = {
    costChanged,
    currentIncomplete: current?.incomplete === true,
    frozenIncomplete: line.acuIncomplete === true,
    aged: ageDays !== null && ageDays >= ACU_FREEZE_AGE_DAYS,
    manualOverride,
    noBaseline: !hasBaseline,
  };

  return {
    itemId: line.id,
    description: line.description,
    acuId: line.acuId,
    quantity,
    discountPct,
    frozenUnitCost,
    currentUnitCost,
    unitCostDelta,
    unitCostDeltaPct,
    markupPct,
    currentUnitPrice,
    suggestedUnitPrice,
    unitPriceDelta,
    currentLineTotal,
    suggestedLineTotal,
    lineTotalDelta,
    direction:
      unitCostDelta === null
        ? 'unknown'
        : unitCostDelta >= ACU_COST_EPSILON
          ? 'up'
          : unitCostDelta <= -ACU_COST_EPSILON
            ? 'down'
            : 'same',
    pricedAt,
    ageDays,
    stale: Object.values(flags).some(Boolean),
    flags,
  };
}

/**
 * Resume el aviso de toda una cotización.
 *
 * `currentTotal` y `suggestedTotal` suman SOLO las líneas enlazadas a un ACU, no el
 * subtotal de la cotización: el desfase que se puede medir es el de esas líneas, y
 * mezclarlo con las escritas a mano daría un porcentaje que no significa nada.
 * Las líneas enlazadas son siempre hojas del árbol (un grupo no tiene precio propio),
 * así que sumarlas no puede contar nada dos veces.
 */
export function summarizeAcuDrift(lines: AcuDriftLine[]): AcuDriftSummary {
  const currentTotal = round2(lines.reduce((s, l) => s + l.currentLineTotal, 0));
  const suggestedTotal = round2(
    lines.reduce((s, l) => s + (l.suggestedLineTotal ?? l.currentLineTotal), 0),
  );
  const totalDelta = round2(suggestedTotal - currentTotal);

  const pcts = lines
    .map((l) => l.unitCostDeltaPct)
    .filter((p): p is number => p !== null);

  return {
    linkedLines: lines.length,
    staleLines: lines.filter((l) => l.stale).length,
    incompleteLines: lines.filter(
      (l) => l.flags.currentIncomplete || l.flags.frozenIncomplete,
    ).length,
    currentTotal,
    suggestedTotal,
    totalDelta,
    totalDeltaPct: currentTotal !== 0 ? round2((totalDelta / currentTotal) * 100) : null,
    maxDeltaPct: pcts.length
      ? pcts.reduce((max, p) => (Math.abs(p) > Math.abs(max) ? p : max), pcts[0])
      : null,
  };
}

/**
 * Informe completo. Ordena primero lo que más se ha movido, para que la primera línea
 * de la lista sea la que de verdad hay que mirar.
 */
export function buildAcuDriftReport(
  lines: AcuDriftLine[],
  generatedAt: Date = new Date(),
): AcuDriftReport {
  const ordered = [...lines].sort((a, b) => {
    if (a.stale !== b.stale) return a.stale ? -1 : 1;
    return Math.abs(b.unitCostDelta ?? 0) - Math.abs(a.unitCostDelta ?? 0);
  });
  return { ...summarizeAcuDrift(ordered), lines: ordered, generatedAt };
}
