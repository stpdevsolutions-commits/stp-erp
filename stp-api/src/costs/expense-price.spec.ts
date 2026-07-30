import {
  resolveExpenseAmount,
  yieldsPrice,
  derivedPriceChanged,
  DerivedPriceSnapshot,
} from './expense-price';

describe('resolveExpenseAmount', () => {
  it('usa el amount tal cual cuando no hay desglose', () => {
    expect(resolveExpenseAmount({ amount: 12500 })).toEqual({ amount: 12500, derived: false });
  });

  it('recalcula desde cantidad × unitario', () => {
    expect(resolveExpenseAmount({ quantity: 100, unitPrice: 41.2 })).toEqual({
      amount: 4120,
      derived: true,
    });
  });

  it('el cálculo gana sobre un amount que no cuadra', () => {
    expect(resolveExpenseAmount({ amount: 999, quantity: 10, unitPrice: 5 }).amount).toBe(50);
  });

  it('redondea el importe a 2 decimales', () => {
    // 3 × 41.2034 = 123.6102 → 123.61
    expect(resolveExpenseAmount({ quantity: 3, unitPrice: 41.2034 }).amount).toBe(123.61);
  });

  it('rechaza medio desglose', () => {
    expect(() => resolveExpenseAmount({ amount: 100, quantity: 5 })).toThrow(/juntos/);
    expect(() => resolveExpenseAmount({ amount: 100, unitPrice: 5 })).toThrow(/juntos/);
  });

  it('rechaza quedarse sin importe', () => {
    expect(() => resolveExpenseAmount({})).toThrow(/Falta amount/);
  });

  it('rechaza cantidades imposibles', () => {
    expect(() => resolveExpenseAmount({ quantity: 0, unitPrice: 10 })).toThrow(/quantity/);
    expect(() => resolveExpenseAmount({ quantity: -1, unitPrice: 10 })).toThrow(/quantity/);
    expect(() => resolveExpenseAmount({ quantity: 1, unitPrice: -10 })).toThrow(/unitPrice/);
  });

  it('acepta unitario 0 (material recibido sin costo)', () => {
    expect(resolveExpenseAmount({ quantity: 5, unitPrice: 0 }).amount).toBe(0);
  });
});

describe('yieldsPrice', () => {
  it('exige material + cantidad + unitario', () => {
    expect(yieldsPrice({ materialId: 'm', quantity: 10, unitPrice: 41.2 })).toBe(true);
  });

  it('un gasto sin material no da precio', () => {
    expect(yieldsPrice({ quantity: 10, unitPrice: 41.2 })).toBe(false);
  });

  it('un material sin desglose no da precio, pero el gasto sigue siendo válido', () => {
    expect(yieldsPrice({ materialId: 'm' })).toBe(false);
    expect(yieldsPrice({ materialId: 'm', quantity: 10 })).toBe(false);
  });

  it('cantidad 0 no da precio', () => {
    expect(yieldsPrice({ materialId: 'm', quantity: 0, unitPrice: 41.2 })).toBe(false);
  });
});

const snap = (over: Partial<DerivedPriceSnapshot> = {}): DerivedPriceSnapshot => ({
  materialId: 'mat-1',
  unitPrice: 41.2,
  date: '2026-07-20',
  supplierId: 'sup-1',
  itbisIncluded: false,
  ...over,
});

describe('derivedPriceChanged', () => {
  it('sin precio previo, siempre hay que crear', () => {
    expect(derivedPriceChanged(null, snap())).toBe(true);
  });

  it('no cambia nada si el gasto se editó en campos que no afectan al precio', () => {
    expect(derivedPriceChanged(snap(), snap())).toBe(false);
  });

  it('ignora la parte horaria de la fecha', () => {
    expect(derivedPriceChanged(snap({ date: '2026-07-20T00:00:00.000Z' }), snap())).toBe(false);
  });

  it('detecta cambios en cada campo relevante', () => {
    expect(derivedPriceChanged(snap(), snap({ unitPrice: 42 }))).toBe(true);
    expect(derivedPriceChanged(snap(), snap({ materialId: 'mat-2' }))).toBe(true);
    expect(derivedPriceChanged(snap(), snap({ date: '2026-07-21' }))).toBe(true);
    expect(derivedPriceChanged(snap(), snap({ supplierId: 'sup-2' }))).toBe(true);
    expect(derivedPriceChanged(snap(), snap({ supplierId: null }))).toBe(true);
    expect(derivedPriceChanged(snap(), snap({ itbisIncluded: true }))).toBe(true);
  });

  it('no confunde undefined con null en el proveedor', () => {
    const prev = { ...snap(), supplierId: undefined as unknown as null };
    expect(derivedPriceChanged(prev, snap({ supplierId: null }))).toBe(false);
  });

  it('tolera ruido de coma flotante del numeric de Postgres', () => {
    expect(derivedPriceChanged(snap({ unitPrice: 41.2000000001 }), snap({ unitPrice: 41.2 }))).toBe(false);
  });
});
