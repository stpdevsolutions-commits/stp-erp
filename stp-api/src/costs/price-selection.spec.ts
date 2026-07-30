import {
  normalizeMaterialName,
  computeNetUnitPrice,
  pickCurrentPrice,
  currentPriceBySupplier,
  summarizePrices,
  PriceLike,
} from './price-selection';

describe('normalizeMaterialName', () => {
  it('colapsa ruido tipográfico al mismo texto', () => {
    expect(normalizeMaterialName('Cable THHN #12 (Phelps Dodge)')).toBe(
      normalizeMaterialName('cable  thhn  #12   phelps dodge'),
    );
  });

  it('quita acentos pero conserva calibres y medidas', () => {
    expect(normalizeMaterialName('Tubería PVC 1/2" SCH-40')).toBe('tuberia pvc 1/2 sch-40');
  });

  it('tolera vacío y null', () => {
    expect(normalizeMaterialName('')).toBe('');
    expect(normalizeMaterialName(undefined as unknown as string)).toBe('');
  });

  it('NO empareja sinónimos — eso es problema aparte', () => {
    expect(normalizeMaterialName('Cable THHN 12')).not.toBe(normalizeMaterialName('Alambre THHN 12'));
  });
});

describe('computeNetUnitPrice', () => {
  it('deja igual un precio DOP sin impuestos ni descuento', () => {
    expect(computeNetUnitPrice({ price: 41.2, currency: 'DOP' })).toBe(41.2);
  });

  it('descuenta el ITBIS cuando viene incluido', () => {
    // 495 con 18% incluido → 419.4915
    expect(computeNetUnitPrice({ price: 495, currency: 'DOP', itbisIncluded: true, itbisRate: 18 })).toBe(
      419.4915,
    );
  });

  it('aplica el descuento antes de quitar el ITBIS', () => {
    const v = computeNetUnitPrice({
      price: 1000,
      currency: 'DOP',
      discountPct: 10,
      itbisIncluded: true,
      itbisRate: 18,
    });
    expect(v).toBe(762.7119); // 1000 * 0.9 / 1.18
  });

  it('convierte USD a DOP con la tasa', () => {
    expect(computeNetUnitPrice({ price: 100, currency: 'USD', exchangeRate: 61.5 })).toBe(6150);
  });

  it('exige tasa de cambio si la moneda no es DOP', () => {
    expect(() => computeNetUnitPrice({ price: 100, currency: 'USD' })).toThrow(/exchangeRate/);
    expect(() => computeNetUnitPrice({ price: 100, currency: 'USD', exchangeRate: 0 })).toThrow(
      /exchangeRate/,
    );
  });

  it('rechaza entradas imposibles', () => {
    expect(() => computeNetUnitPrice({ price: -1, currency: 'DOP' })).toThrow();
    expect(() => computeNetUnitPrice({ price: NaN, currency: 'DOP' })).toThrow();
    expect(() => computeNetUnitPrice({ price: 10, currency: 'DOP', discountPct: 100 })).toThrow();
  });

  it('ignora itbisRate si el precio no lo incluye', () => {
    expect(computeNetUnitPrice({ price: 100, currency: 'DOP', itbisIncluded: false, itbisRate: 18 })).toBe(
      100,
    );
  });
});

const p = (over: Partial<PriceLike> & { id: string; date: string; netUnitPrice: number }): PriceLike => ({
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

describe('pickCurrentPrice', () => {
  it('devuelve null si no hay precios', () => {
    expect(pickCurrentPrice([])).toBeNull();
  });

  it('toma el de fecha de vigencia más reciente, no el insertado más tarde', () => {
    const viejo = p({
      id: 'viejo',
      date: '2026-07-01',
      netUnitPrice: 700,
      createdAt: new Date('2026-07-30T00:00:00Z'), // capturado después
    });
    const nuevo = p({ id: 'nuevo', date: '2026-07-20', netUnitPrice: 725 });
    expect(pickCurrentPrice([viejo, nuevo])?.id).toBe('nuevo');
  });

  it('a igual fecha, gana el capturado más tarde', () => {
    const a = p({ id: 'a', date: '2026-07-20', netUnitPrice: 700, createdAt: new Date('2026-07-20T08:00:00Z') });
    const b = p({ id: 'b', date: '2026-07-20', netUnitPrice: 725, createdAt: new Date('2026-07-20T18:00:00Z') });
    expect(pickCurrentPrice([a, b])?.id).toBe('b');
  });

  it('ignora los anulados', () => {
    const anulado = p({ id: 'anulado', date: '2026-07-25', netUnitPrice: 9999, voidedAt: new Date() });
    const bueno = p({ id: 'bueno', date: '2026-07-20', netUnitPrice: 725 });
    expect(pickCurrentPrice([anulado, bueno])?.id).toBe('bueno');
  });

  it('devuelve null si todos están anulados', () => {
    expect(pickCurrentPrice([p({ id: 'x', date: '2026-07-01', netUnitPrice: 1, voidedAt: new Date() })])).toBeNull();
  });
});

describe('currentPriceBySupplier', () => {
  it('da un solo precio por proveedor, del más barato al más caro', () => {
    const prices = [
      p({ id: 'a1', supplierId: 'A', date: '2026-07-01', netUnitPrice: 730 }),
      p({ id: 'a2', supplierId: 'A', date: '2026-07-20', netUnitPrice: 725 }), // vigente de A
      p({ id: 'b1', supplierId: 'B', date: '2026-07-18', netUnitPrice: 718 }),
    ];
    const res = currentPriceBySupplier(prices);
    expect(res.map((r) => r.id)).toEqual(['b1', 'a2']);
  });

  it('agrupa los precios sin proveedor en un solo cubo', () => {
    const prices = [
      p({ id: 's1', date: '2026-07-01', netUnitPrice: 500 }),
      p({ id: 's2', date: '2026-07-10', netUnitPrice: 510 }),
    ];
    expect(currentPriceBySupplier(prices)).toHaveLength(1);
    expect(currentPriceBySupplier(prices)[0].id).toBe('s2');
  });
});

describe('summarizePrices', () => {
  it('resumen vacío cuando no hay nada', () => {
    expect(summarizePrices([])).toEqual({
      count: 0,
      current: null,
      currentDate: null,
      min: null,
      max: null,
      avg: null,
      changePct: null,
      ageDays: null,
    });
  });

  it('calcula min/max/promedio y la variación contra el anterior', () => {
    const prices = [
      p({ id: '1', date: '2026-01-15', netUnitPrice: 680 }),
      p({ id: '2', date: '2026-02-15', netUnitPrice: 690 }),
      p({ id: '3', date: '2026-03-15', netUnitPrice: 715 }),
      p({ id: '4', date: '2026-04-15', netUnitPrice: 725 }),
    ];
    const s = summarizePrices(prices, new Date('2026-04-25T12:00:00Z'));
    expect(s.count).toBe(4);
    expect(s.current).toBe(725);
    expect(s.min).toBe(680);
    expect(s.max).toBe(725);
    expect(s.avg).toBe(702.5);
    expect(s.changePct).toBe(1.4); // 725 vs 715
    expect(s.ageDays).toBe(10);
  });

  it('changePct es null con un solo precio', () => {
    expect(summarizePrices([p({ id: '1', date: '2026-04-15', netUnitPrice: 725 })]).changePct).toBeNull();
  });

  it('los anulados no entran en las agregaciones', () => {
    const prices = [
      p({ id: 'ok', date: '2026-04-15', netUnitPrice: 725 }),
      p({ id: 'typo', date: '2026-04-16', netUnitPrice: 72500, voidedAt: new Date() }),
    ];
    const s = summarizePrices(prices, new Date('2026-04-15T00:00:00Z'));
    expect(s.count).toBe(1);
    expect(s.max).toBe(725);
    expect(s.current).toBe(725);
  });

  it('ageDays nunca es negativo aunque el precio tenga fecha futura', () => {
    const s = summarizePrices([p({ id: '1', date: '2026-12-31', netUnitPrice: 1 })], new Date('2026-07-30T00:00:00Z'));
    expect(s.ageDays).toBe(0);
  });
});
