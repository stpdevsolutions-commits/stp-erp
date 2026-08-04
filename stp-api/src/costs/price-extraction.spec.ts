import { sanitizeExtraction, MAX_LINES, MAX_UNIT_PRICE, RawExtraction } from './price-extraction';
import { PriceCurrency } from './entities/material-price.entity';

/** Línea válida a la que las pruebas le cambian solo el campo que están mirando. */
function line(overrides: Record<string, unknown> = {}) {
  return {
    description: 'Cemento gris Portland 42.5 kg',
    code: 'CEM-425',
    unit: 'saco',
    price: 415,
    currency: 'DOP',
    itbisIncluded: false,
    discountPct: 0,
    ...overrides,
  };
}

function extraction(lines: unknown[], documentDate: string | null = '2026-08-01'): RawExtraction {
  return { documentDate, lines } as RawExtraction;
}

describe('sanitizeExtraction', () => {
  it('conserva una línea buena tal cual y le pone su posición', () => {
    const { lines } = sanitizeExtraction(extraction([line()]));

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      position: 0,
      rawDescription: 'Cemento gris Portland 42.5 kg',
      rawCode: 'CEM-425',
      rawUnit: 'saco',
      price: 415,
      currency: PriceCurrency.DOP,
      itbisIncluded: false,
      discountPct: 0,
    });
  });

  it('descarta precios no utilizables en vez de corregirlos', () => {
    const { lines, discarded } = sanitizeExtraction(
      extraction([
        line({ description: 'Cero', price: 0 }),
        line({ description: 'Negativo', price: -5 }),
        line({ description: 'Nulo', price: null }),
        line({ description: 'Texto', price: 'mil' }),
      ]),
    );

    expect(lines).toHaveLength(0);
    expect(discarded).toHaveLength(4);
  });

  it('descarta un precio en DOP fuera de rango (separador de miles mal leído)', () => {
    const { lines, discarded } = sanitizeExtraction(
      extraction([line({ description: 'Varilla', price: MAX_UNIT_PRICE + 1 })]),
    );

    expect(lines).toHaveLength(0);
    expect(discarded[0]).toContain('fuera de rango');
  });

  it('no aplica el tope de DOP a los precios en USD', () => {
    const { lines } = sanitizeExtraction(
      extraction([line({ price: MAX_UNIT_PRICE + 1, currency: 'USD' })]),
    );

    expect(lines).toHaveLength(1);
    expect(lines[0].currency).toBe(PriceCurrency.USD);
  });

  it('acepta las monedas como las escribe un documento dominicano', () => {
    const { lines } = sanitizeExtraction(
      extraction([
        line({ description: 'a', currency: 'RD$' }),
        line({ description: 'b', currency: 'us$' }),
        line({ description: 'c', currency: ' dop ' }),
      ]),
    );

    expect(lines.map((l) => l.currency)).toEqual([
      PriceCurrency.DOP,
      PriceCurrency.USD,
      PriceCurrency.DOP,
    ]);
  });

  it('descarta una moneda que no reconoce en vez de asumir DOP', () => {
    const { lines, discarded } = sanitizeExtraction(extraction([line({ currency: 'EUR' })]));

    expect(lines).toHaveLength(0);
    expect(discarded[0]).toContain('moneda desconocida');
  });

  it('descarta líneas sin descripción', () => {
    const { lines, discarded } = sanitizeExtraction(
      extraction([line({ description: '   ' }), line({ description: null })]),
    );

    expect(lines).toHaveLength(0);
    expect(discarded).toHaveLength(2);
  });

  it('ignora un descuento imposible en lugar de rechazar la línea entera', () => {
    const { lines } = sanitizeExtraction(
      extraction([
        line({ description: 'a', discountPct: 150 }),
        line({ description: 'b', discountPct: -10 }),
        line({ description: 'c', discountPct: 12.5 }),
      ]),
    );

    expect(lines.map((l) => l.discountPct)).toEqual([0, 0, 12.5]);
  });

  it('solo cree itbisIncluded cuando es exactamente true', () => {
    const { lines } = sanitizeExtraction(
      extraction([
        line({ description: 'a', itbisIncluded: 'sí' }),
        line({ description: 'b', itbisIncluded: true }),
      ]),
    );

    expect(lines.map((l) => l.itbisIncluded)).toEqual([false, true]);
  });

  it('normaliza a null los campos opcionales vacíos', () => {
    const { lines } = sanitizeExtraction(extraction([line({ code: '  ', unit: '' })]));

    expect(lines[0].rawCode).toBeNull();
    expect(lines[0].rawUnit).toBeNull();
  });

  it('acepta la fecha del documento solo si es una fecha real', () => {
    expect(sanitizeExtraction(extraction([], '2026-08-01')).documentDate).toBe('2026-08-01');
    expect(sanitizeExtraction(extraction([], '2026-02-31')).documentDate).toBeNull();
    expect(sanitizeExtraction(extraction([], '01/08/2026')).documentDate).toBeNull();
    expect(sanitizeExtraction(extraction([], null)).documentDate).toBeNull();
  });

  it('corta en el tope de líneas y lo deja anotado', () => {
    const many = Array.from({ length: MAX_LINES + 5 }, (_, i) => line({ description: `Item ${i}` }));
    const { lines, discarded } = sanitizeExtraction(extraction(many));

    expect(lines).toHaveLength(MAX_LINES);
    expect(discarded.some((d) => d.includes('tope del importador'))).toBe(true);
  });

  it('numera las posiciones sobre las líneas que sobreviven, no sobre las originales', () => {
    const { lines } = sanitizeExtraction(
      extraction([
        line({ description: 'buena 1' }),
        line({ description: 'mala', price: 0 }),
        line({ description: 'buena 2' }),
      ]),
    );

    expect(lines.map((l) => [l.position, l.rawDescription])).toEqual([
      [0, 'buena 1'],
      [1, 'buena 2'],
    ]);
  });

  it('aguanta una respuesta sin líneas', () => {
    expect(sanitizeExtraction({ documentDate: null, lines: undefined } as unknown as RawExtraction))
      .toMatchObject({ lines: [], discarded: [] });
  });
});
