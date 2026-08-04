/**
 * Lógica pura del ACU (Análisis de Costos Unitarios): a partir de la receta de una
 * partida y de los precios vigentes, calcula cuánto cuesta UNA unidad de esa partida.
 *
 * Sin dependencias de TypeORM ni de Nest para poder probarla sola, igual que
 * `price-selection.ts` y `quotes/quote-tree.ts`.
 *
 * El ACU responde "¿cuánto me cuesta un metro de canalización?" descomponiéndolo en
 * insumos: tanto cable, tanto tubo, tanta mano de obra. El unitario NO se guarda: se
 * recalcula con los precios del día, porque un ACU con precio congelado envejece en
 * silencio y es exactamente el error que este módulo existe para evitar. Congelar es
 * decisión de la COTIZACIÓN al aprobarse, no del ACU.
 */

export type AcuItemKind = 'material' | 'labor' | 'equipment';

/** Cómo se valora una línea de mano de obra o equipo. */
export type AcuLaborBasis =
  /** Rendimiento medido: `quantity` recursos por unidad de partida × `unitCost`. */
  | 'yield'
  /** Porcentaje sobre el costo de materiales de la propia partida. */
  | 'pct_materials';

export interface AcuItemInput {
  id: string;
  kind: AcuItemKind;
  description?: string | null;
  /** Material del catálogo. Solo en `kind = 'material'`. */
  materialId?: string | null;
  /**
   * Consumo por unidad de partida: 3.2 pies de cable por metro de canalización,
   * 0.125 días de electricista por salida. En `pct_materials` se ignora.
   */
  quantity?: number | null;
  /**
   * Costo unitario del insumo. En materiales es opcional: si falta, se toma el precio
   * vigente del catálogo. En mano de obra y equipo es la tarifa (por día, por hora).
   */
  unitCost?: number | null;
  /** Solo mano de obra/equipo. Por defecto `yield`. */
  basis?: AcuLaborBasis | null;
  /** Porcentaje sobre materiales cuando `basis = 'pct_materials'`. */
  pct?: number | null;
  /**
   * Desperdicio en porcentaje: recortes de tubo, empalmes, roturas. Se aplica sobre la
   * cantidad, no sobre el precio. 5 = se compra un 5 % más de lo que se instala.
   */
  wastePct?: number | null;
}

export interface AcuCostLine {
  itemId: string;
  kind: AcuItemKind;
  description: string;
  /** Cantidad ya con el desperdicio aplicado. */
  effectiveQuantity: number;
  unitCost: number;
  subtotal: number;
  /** De dónde salió `unitCost`: del catálogo o escrito a mano en la receta. */
  costSource: 'catalog' | 'manual' | 'pct';
  /** El material no tiene precio vigente: la línea vale 0 y el ACU queda incompleto. */
  missingPrice: boolean;
}

export interface AcuCost {
  lines: AcuCostLine[];
  materialCost: number;
  laborCost: number;
  equipmentCost: number;
  /** Costo directo de UNA unidad de la partida. */
  directCost: number;
  /**
   * Falta el precio de al menos un material. El total es un piso, no el costo real:
   * quien lo consuma debe avisar en vez de presentarlo como bueno.
   */
  incomplete: boolean;
  missingMaterialIds: string[];
}

/** Precio vigente por material, tal como lo entrega `pickCurrentPrice`. */
export type CurrentPriceMap = Map<string, number>;

/**
 * 4 decimales en TODO el cálculo, subtotales incluidos, por la misma razón que
 * `computeNetUnitPrice`: el resultado es un unitario que después se multiplica por
 * cantidades de obra (500 m de canalización), y redondear cada línea a 2 mete un sesgo
 * que crece con la cantidad. El redondeo a 2 es cosa de la presentación, no del cálculo.
 * Como todas las líneas se redondean igual, el desglose sigue sumando exacto el total.
 */
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

function positive(n: number | null | undefined, fallback = 0): number {
  return Number.isFinite(n) && (n as number) >= 0 ? (n as number) : fallback;
}

/**
 * Valora la receta de un ACU.
 *
 * El orden importa: las líneas `pct_materials` se calculan DESPUÉS de los materiales,
 * porque su base es el costo de materiales ya resuelto. Un porcentaje sobre un total
 * que todavía no existe daría 0 sin avisar.
 */
export function computeAcuCost(items: AcuItemInput[], prices: CurrentPriceMap): AcuCost {
  const lines: AcuCostLine[] = [];
  const missing = new Set<string>();

  // --- Paso 1: materiales y todo lo que se valora por rendimiento.
  for (const item of items) {
    if (isPctLine(item)) continue;

    const waste = positive(item.wastePct, 0);
    const qty = positive(item.quantity, 0);
    const effectiveQuantity = round4(qty * (1 + waste / 100));

    let unitCost = 0;
    let costSource: AcuCostLine['costSource'] = 'manual';
    let missingPrice = false;

    if (item.kind === 'material') {
      if (item.unitCost != null && Number.isFinite(item.unitCost)) {
        // Override explícito en la receta: gana sobre el catálogo. Sirve para materiales
        // que aún no están en el catálogo o para un precio negociado de una obra.
        unitCost = positive(item.unitCost, 0);
        costSource = 'manual';
      } else if (item.materialId && prices.has(item.materialId)) {
        unitCost = positive(prices.get(item.materialId), 0);
        costSource = 'catalog';
      } else {
        // Sin precio: la línea vale 0 y el ACU entero queda marcado. NO se inventa un
        // precio ni se omite la línea en silencio.
        missingPrice = true;
        if (item.materialId) missing.add(item.materialId);
      }
    } else {
      unitCost = positive(item.unitCost, 0);
      costSource = 'manual';
    }

    lines.push({
      itemId: item.id,
      kind: item.kind,
      description: item.description ?? '',
      effectiveQuantity,
      unitCost: round4(unitCost),
      subtotal: round4(effectiveQuantity * unitCost),
      costSource,
      missingPrice,
    });
  }

  const materialCost = round4(sumBy(lines, 'material'));

  // --- Paso 2: porcentajes sobre materiales, ya con la base resuelta.
  for (const item of items) {
    if (!isPctLine(item)) continue;
    const pct = positive(item.pct, 0);
    const subtotal = round4((materialCost * pct) / 100);
    lines.push({
      itemId: item.id,
      kind: item.kind,
      description: item.description ?? '',
      effectiveQuantity: pct,
      unitCost: materialCost,
      subtotal,
      costSource: 'pct',
      missingPrice: false,
    });
  }

  const laborCost = round4(sumBy(lines, 'labor'));
  const equipmentCost = round4(sumBy(lines, 'equipment'));

  return {
    lines,
    materialCost,
    laborCost,
    equipmentCost,
    directCost: round4(materialCost + laborCost + equipmentCost),
    incomplete: lines.some((l) => l.missingPrice),
    missingMaterialIds: [...missing],
  };
}

function isPctLine(item: AcuItemInput): boolean {
  return item.kind !== 'material' && item.basis === 'pct_materials';
}

function sumBy(lines: AcuCostLine[], kind: AcuItemKind): number {
  return lines.filter((l) => l.kind === kind).reduce((acc, l) => acc + l.subtotal, 0);
}

/**
 * Convierte una cantidad entre dos unidades de la misma magnitud usando el `factor`
 * de `units` (factor = cuántas unidades base vale una).
 *
 * Existe porque la receta pide "3.2 pies de cable" y el catálogo puede tener ese cable
 * en metros: multiplicar sin convertir mete un error del 228 % sin que nadie lo note.
 * Devuelve null si no son convertibles — el llamador debe tratarlo como error, nunca
 * asumir factor 1.
 */
export function convertQuantity(
  quantity: number,
  from: { factor?: number | null; baseUnitId?: string | null; id: string },
  to: { factor?: number | null; baseUnitId?: string | null; id: string },
): number | null {
  if (from.id === to.id) return quantity;

  const fromBase = from.baseUnitId ?? from.id;
  const toBase = to.baseUnitId ?? to.id;
  if (fromBase !== toBase) return null;

  const fromFactor = from.baseUnitId ? from.factor : 1;
  const toFactor = to.baseUnitId ? to.factor : 1;
  if (!fromFactor || !toFactor || fromFactor <= 0 || toFactor <= 0) return null;

  return round4((quantity * fromFactor) / toFactor);
}
