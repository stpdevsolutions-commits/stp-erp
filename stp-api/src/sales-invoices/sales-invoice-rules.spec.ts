import {
  indicadorFacturacion,
  invoiceTotals,
  lineAmounts,
  quoteToLines,
  tipoEcfFor,
  type QuoteLike,
} from './sales-invoice-rules';

const items = (rows: [string, number][]): QuoteLike['items'] =>
  rows.map(([description, total], i) => ({
    id: `i${i}`,
    parentId: null,
    kind: 'group',
    description,
    quantity: 0,
    unit: null,
    total,
    sortOrder: i,
  }));

describe('totales de la factura', () => {
  it('calcula el ITBIS por línea y suma', () => {
    expect(lineAmounts({ quantity: 2, unitPrice: 100, itbisRate: 18 })).toEqual({ total: 200, itbisAmount: 36 });
    const t = invoiceTotals([
      { quantity: 1, unitPrice: 1000, itbisRate: 18 },
      { quantity: 1, unitPrice: 500, itbisRate: 0 },
    ]);
    expect(t).toEqual({ subtotal: 1500, itbis: 180, total: 1680 });
  });

  it('mapea la tasa al indicador del e-CF', () => {
    expect(indicadorFacturacion(18)).toBe(1);
    expect(indicadorFacturacion(16)).toBe(2);
    expect(indicadorFacturacion(0)).toBe(4);
  });

  it('elige el tipo de e-CF por el RNC del cliente', () => {
    expect(tipoEcfFor('1-32-52957-1')).toEqual({ tipoEcf: 'e-CF_31_v_1_0', rnc: '132529571' });
    expect(tipoEcfFor('')).toEqual({ tipoEcf: 'e-CF_32_v_1_0', rnc: undefined });
    expect(tipoEcfFor(null).tipoEcf).toBe('e-CF_32_v_1_0');
  });
});

describe('cotización → factura', () => {
  // Directo 100,000; Dirección Técnica 10% (gravable) = 10,000; Imprevistos 5% = 5,000;
  // ITBIS 18% sobre lo gravable = 1,800. Total 116,800.
  const quote: QuoteLike = {
    subtotal: 100000,
    discount: 0,
    total: 116800,
    indirectCosts: [
      { name: 'Dirección Técnica', pct: 10, amount: 10000, taxable: true },
      { name: 'Imprevistos', pct: 5, amount: 5000 },
      { name: 'ITBIS', pct: 18, amount: 1800, kind: 'itbis', baseMode: 'gravables' },
    ],
    items: items([['Pisos', 60000], ['Pintura', 40000]]),
  };

  it('solo cobra ITBIS a los gastos gravables y cuadra con la cotización', () => {
    const { lines, warnings } = quoteToLines(quote);
    expect(warnings).toEqual([]);
    expect(lines.map((l) => [l.description, l.unitPrice, l.itbisRate])).toEqual([
      ['Pisos', 60000, 0],
      ['Pintura', 40000, 0],
      ['Dirección Técnica', 10000, 18],
      ['Imprevistos', 5000, 0],
    ]);
    expect(invoiceTotals(lines).total).toBe(116800);
  });

  it('factura solo un porcentaje', () => {
    const { lines } = quoteToLines(quote, 30);
    expect(invoiceTotals(lines).total).toBe(35040);
    expect(lines[0].unitPrice).toBe(18000);
  });

  it('con base "total" todo paga ITBIS', () => {
    const q: QuoteLike = {
      ...quote,
      total: 135700,
      indirectCosts: [
        { name: 'Dirección Técnica', pct: 10, amount: 10000 },
        { name: 'ITBIS', pct: 18, amount: 20700, kind: 'itbis', baseMode: 'total' },
      ],
    };
    const { lines, warnings } = quoteToLines(q);
    expect(lines.every((l) => l.itbisRate === 18)).toBe(true);
    expect(invoiceTotals(lines).total).toBe(129800);
    expect(warnings.length).toBe(1); // el total de prueba no cuadra a propósito
  });

  it('cotización antigua: tasa fija sobre las partidas, con descuento repartido', () => {
    const q: QuoteLike = {
      subtotal: 1000,
      discount: 100,
      taxRate: 18,
      total: 1062,
      indirectCosts: null,
      items: items([['Servicio', 1000]]),
    };
    const { lines, warnings } = quoteToLines(q);
    expect(warnings).toEqual([]);
    expect(lines).toHaveLength(1);
    expect(invoiceTotals(lines).total).toBe(1062);
  });

  it('una partida suelta lleva su cantidad en la descripción', () => {
    const q: QuoteLike = {
      subtotal: 1200,
      total: 1416,
      taxRate: 18,
      indirectCosts: null,
      items: [
        { id: 'a', parentId: null, kind: 'item', description: 'Cable', quantity: 12, unit: 'ml', total: 1200, sortOrder: 0 },
      ],
    };
    expect(quoteToLines(q).lines[0]).toMatchObject({ description: 'Cable (12 ml)', unitPrice: 1200 });
  });
});
