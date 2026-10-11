import { applyHistory, summarizeHistory, type HistoryRow } from './supplier-history';

const row = (expenseType: string, paymentMethod: string, invoiceDate = '2026-09-01'): HistoryRow => ({ expenseType, paymentMethod, invoiceDate });

describe('supplier-history', () => {
  describe('summarizeHistory', () => {
    it('toma el valor más frecuente y dice qué tan dominante es', () => {
      const h = summarizeHistory([row('09', '03'), row('09', '03'), row('09', '02'), row('02', '03')]);
      expect(h.count).toBe(4);
      expect(h.expenseType).toEqual({ value: '09', n: 3, share: 0.75 });
      expect(h.paymentMethod).toEqual({ value: '03', n: 3, share: 0.75 });
    });

    it('si empatan, gana el de la factura más reciente', () => {
      const h = summarizeHistory([row('02', '03', '2026-08-01'), row('09', '03', '2026-10-01')]);
      expect(h.expenseType?.value).toBe('09');
    });

    it('no sugiere códigos fuera del catálogo (los 12 y 99 de FiscoRD)', () => {
      const h = summarizeHistory([row('99', '03'), row('99', '03'), row('12', '03'), row('02', '03')]);
      expect(h.count).toBe(4);
      expect(h.expenseType).toEqual({ value: '02', n: 1, share: 1 });
    });

    it('sin facturas no hay sugerencia', () => {
      expect(summarizeHistory([])).toEqual({ count: 0, expenseType: null, paymentMethod: null });
    });

    it('solo con valores fuera de catálogo no hay sugerencia de tipo', () => {
      expect(summarizeHistory([row('99', '03')]).expenseType).toBeNull();
    });
  });

  describe('applyHistory — tipo de gasto', () => {
    const hab = summarizeHistory([row('09', '03'), row('09', '03'), row('09', '03')]);

    it('con un hábito claro (3 facturas iguales) manda sobre lo que adivinó la IA', () => {
      const r = applyHistory({ expenseType: '02', paymentMethod: '01' }, hab, 'ia');
      expect(r.expenseType).toBe('09');
      expect(r.applied).toContain('expenseType');
    });

    it('llena el tipo cuando la lectura no trajo ninguno, aunque haya una sola factura previa', () => {
      const una = summarizeHistory([row('03', '02')]);
      expect(applyHistory({ expenseType: null, paymentMethod: '01' }, una, 'ia').expenseType).toBe('03');
    });

    it('con una sola factura previa NO pisa un tipo que la IA sí leyó', () => {
      const una = summarizeHistory([row('03', '02')]);
      const r = applyHistory({ expenseType: '09', paymentMethod: '01' }, una, 'ia');
      expect(r.expenseType).toBe('09');
      expect(r.applied).not.toContain('expenseType');
    });

    it('sin un patrón (3 tipos distintos, una factura de cada uno) no pisa lo que se leyó', () => {
      const mezcla = summarizeHistory([row('09', '03'), row('02', '03'), row('05', '03')]);
      expect(applyHistory({ expenseType: '02', paymentMethod: '01' }, mezcla, 'ia').expenseType).toBe('02');
    });

    it('si ya coincide no lo marca como aplicado', () => {
      expect(applyHistory({ expenseType: '09', paymentMethod: '01' }, hab, 'ia').applied).not.toContain('expenseType');
    });
  });

  describe('applyHistory — forma de pago', () => {
    const tarjeta = summarizeHistory([row('09', '03'), row('09', '03')]);

    it('IA: "01" (lo que dice cuando no sabe) se reemplaza por el hábito del proveedor', () => {
      const r = applyHistory({ expenseType: '09', paymentMethod: '01' }, tarjeta, 'ia');
      expect(r.paymentMethod).toBe('03');
      expect(r.applied).toContain('paymentMethod');
    });

    it('IA: si la factura dice claramente otra forma de pago, esa manda', () => {
      expect(applyHistory({ expenseType: '09', paymentMethod: '02' }, tarjeta, 'ia').paymentMethod).toBe('02');
    });

    it('IA: con una sola factura previa no cambia el "01"', () => {
      const una = summarizeHistory([row('09', '03')]);
      expect(applyHistory({ expenseType: '09', paymentMethod: '01' }, una, 'ia').paymentMethod).toBe('01');
    });

    it('QR (no hay lectura de nada): basta una factura previa', () => {
      const una = summarizeHistory([row('09', '03')]);
      expect(applyHistory({ expenseType: null, paymentMethod: '01' }, una, 'qr').paymentMethod).toBe('03');
    });

    it('un proveedor sin historial no cambia nada', () => {
      const r = applyHistory({ expenseType: null, paymentMethod: '01' }, summarizeHistory([]), 'qr');
      expect(r).toEqual({ expenseType: null, paymentMethod: '01', applied: [] });
    });
  });
});
