/**
 * Lógica pura del puente Gastos → Precios: qué importe manda, cuándo un gasto da un
 * precio aprovechable y cuándo el precio derivado ha cambiado de verdad.
 * Sin TypeORM ni Nest (ver `expense-price.spec.ts`).
 */

export interface AmountInput {
  amount?: number | null;
  quantity?: number | null;
  unitPrice?: number | null;
}

export interface AmountResult {
  amount: number;
  /** true si se recalculó a partir de cantidad × unitario. */
  derived: boolean;
}

/**
 * El importe del gasto cuando hay desglose es SIEMPRE cantidad × unitario: si el
 * usuario manda además un `amount` que no cuadra, gana el cálculo. Tener dos números
 * que se contradicen en la misma fila es peor que rechazar la entrada.
 */
export function resolveExpenseAmount(input: AmountInput): AmountResult {
  const { quantity, unitPrice } = input;
  const hasQty = quantity != null;
  const hasUnit = unitPrice != null;

  if (hasQty !== hasUnit) {
    throw new Error(
      'quantity y unitPrice deben indicarse juntos: uno solo no permite calcular el importe ni derivar un precio',
    );
  }

  if (!hasQty) {
    if (input.amount == null) throw new Error('Falta amount (o el desglose quantity + unitPrice)');
    return { amount: input.amount, derived: false };
  }

  if (!Number.isFinite(quantity!) || quantity! <= 0) throw new Error('quantity debe ser > 0');
  if (!Number.isFinite(unitPrice!) || unitPrice! < 0) throw new Error('unitPrice no puede ser negativo');

  return { amount: Math.round(quantity! * unitPrice! * 100) / 100, derived: true };
}

export interface DerivedPriceInput {
  materialId?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
}

/**
 * Un gasto solo produce precio si se sabe QUÉ material es y CUÁNTO costó la unidad.
 * Un gasto con material pero sin desglose sigue siendo válido como gasto: solo no
 * alimenta la base de precios.
 */
export function yieldsPrice(input: DerivedPriceInput): boolean {
  return (
    input.materialId != null &&
    input.quantity != null &&
    input.quantity > 0 &&
    input.unitPrice != null &&
    input.unitPrice >= 0
  );
}

export interface DerivedPriceSnapshot {
  materialId: string;
  unitPrice: number;
  date: string;
  supplierId: string | null;
  itbisIncluded: boolean;
}

/** Normaliza para comparar: evita anular e insertar de nuevo cuando nada cambió. */
export function derivedPriceChanged(
  previous: DerivedPriceSnapshot | null,
  next: DerivedPriceSnapshot,
): boolean {
  if (!previous) return true;
  return (
    previous.materialId !== next.materialId ||
    Math.abs(previous.unitPrice - next.unitPrice) > 1e-6 ||
    previous.date.slice(0, 10) !== next.date.slice(0, 10) ||
    (previous.supplierId ?? null) !== (next.supplierId ?? null) ||
    previous.itbisIncluded !== next.itbisIncluded
  );
}
