import {
  daysApart,
  distinctiveTokens,
  matchExpenses,
  namesLookAlike,
  scoreExpense,
  suggestAll,
  type MatchExpense,
  type MatchInvoice,
} from './expense-match';

const inv = (over: Partial<MatchInvoice> = {}): MatchInvoice => ({
  id: 'i1',
  supplierRnc: '101013834',
  supplierName: 'ALMACENES UNIDOS SAS',
  totalAmount: 11456.59,
  baseAmount: 9708.97,
  invoiceDate: '2026-10-06',
  ...over,
});

const exp = (over: Partial<MatchExpense> = {}): MatchExpense => ({
  id: 'e1',
  description: 'Compra de materiales en Almacenes Unidos',
  amount: 11456.59,
  date: '2026-10-06',
  supplierRnc: null,
  supplierName: null,
  ...over,
});

describe('texto', () => {
  it('quita las palabras que no distinguen a un proveedor', () => {
    expect(distinctiveTokens('ALMACENES UNIDOS SAS')).toEqual(['almacenes', 'unidos']);
    expect(distinctiveTokens('LE CROISSANT DORE S R L')).toEqual(['croissant', 'dore']);
  });

  it('reconoce el nombre aunque la descripción lleve más texto, acentos o mayúsculas', () => {
    expect(namesLookAlike('ALMACENES UNIDOS SAS', 'Compra en almacenés UNIDOS, cables')).toBe(true);
    expect(namesLookAlike('ALMACENES UNIDOS SAS', 'Ferretería Don Pedro')).toBe(false);
    expect(namesLookAlike('SAS', 'cualquier cosa')).toBe(false);
  });

  it('cuenta los días entre fechas', () => {
    expect(daysApart('2026-10-06', '2026-10-06')).toBe(0);
    expect(daysApart('2026-10-06', '2026-10-09')).toBe(3);
    expect(daysApart('2026-09-30', '2026-10-02')).toBe(2);
  });
});

describe('scoreExpense', () => {
  it('mismo proveedor (por nombre), mismo monto y misma fecha: coincidencia fuerte', () => {
    const m = scoreExpense(inv(), exp())!;
    expect(m.level).toBe('strong');
    expect(m.score).toBe(85);
    expect(m.reasons).toEqual(['nombre del proveedor parecido', 'mismo monto', 'misma fecha']);
  });

  it('mismo RNC, monto y fecha: 100 puntos', () => {
    const m = scoreExpense(inv(), exp({ description: 'Materiales', supplierRnc: '101-01383-4' }))!;
    expect(m.score).toBe(100);
    expect(m.level).toBe('strong');
  });

  it('un gasto tecleado sin ITBIS (igual a la base) también cuenta', () => {
    const m = scoreExpense(inv(), exp({ amount: 9708.97 }))!;
    expect(m.reasons).toContain('igual a la base sin ITBIS');
    expect(m.level).toBe('strong');
  });

  it('el monto casi igual (centavos de diferencia) sigue siendo fuerte', () => {
    const m = scoreExpense(inv(), exp({ amount: 11457.1 }))!;
    expect(m.reasons).toContain('monto casi igual');
    expect(m.level).toBe('strong');
  });

  it('sin proveedor que coincida ni monto parecido no se sugiere, aunque la fecha sea la misma', () => {
    expect(scoreExpense(inv(), exp({ description: 'Gasolina', amount: 500 }))).toBeNull();
  });

  it('el mismo monto y fecha sin saber el proveedor es solo "posible"', () => {
    const m = scoreExpense(inv(), exp({ description: 'Varios' }))!;
    expect(m.level).toBe('possible');
    expect(m.score).toBe(60);
  });

  it('con la fecha muy lejos baja a posible', () => {
    const m = scoreExpense(inv(), exp({ date: '2026-09-20' }))!;
    expect(m.level).toBe('possible');
  });

  it('fuera de la ventana de 30 días no suma por fecha', () => {
    const m = scoreExpense(inv(), exp({ date: '2026-07-01' }))!;
    expect(m.reasons.some((r) => r.includes('días'))).toBe(false);
  });
});

describe('matchExpenses', () => {
  it('ordena del más al menos probable y respeta el límite', () => {
    const list = [
      exp({ id: 'lejos', date: '2026-09-15' }),
      exp({ id: 'justo' }),
      exp({ id: 'otro', description: 'Gasolina', amount: 9 }),
    ];
    const r = matchExpenses(inv(), list, 2);
    expect(r.map((m) => m.expenseId)).toEqual(['justo', 'lejos']);
  });
});

describe('suggestAll', () => {
  it('reparte cada gasto a una sola factura: gana la más parecida', () => {
    const invoices = [
      { ...inv({ id: 'a', invoiceDate: '2026-10-06' }) },
      { ...inv({ id: 'b', invoiceDate: '2026-10-20' }) },
    ] as Array<MatchInvoice & { id: string }>;
    const r = suggestAll(invoices, [exp({ id: 'solo' })]);
    expect(r).toHaveLength(1);
    expect(r[0].invoiceId).toBe('a');
    expect(r[0].best.expenseId).toBe('solo');
  });

  it('marca como ambigua la que tiene un rival casi igual de bueno', () => {
    const r = suggestAll(
      [inv({ id: 'a' }) as MatchInvoice & { id: string }],
      [exp({ id: 'uno' }), exp({ id: 'dos', date: '2026-10-07' })],
    );
    expect(r[0].ambiguous).toBe(true);
    expect(r[0].alternatives).toHaveLength(1);
  });

  it('no marca ambigua si el rival es claramente peor', () => {
    const r = suggestAll(
      [inv({ id: 'a' }) as MatchInvoice & { id: string }],
      [exp({ id: 'uno' }), exp({ id: 'dos', date: '2026-09-20', description: 'Varios' })],
    );
    expect(r[0].best.expenseId).toBe('uno');
    expect(r[0].ambiguous).toBe(false);
  });

  it('las facturas sin ninguna coincidencia no aparecen', () => {
    const r = suggestAll([inv({ id: 'a' }) as MatchInvoice & { id: string }], [exp({ description: 'Otro', amount: 1 })]);
    expect(r).toEqual([]);
  });
});
