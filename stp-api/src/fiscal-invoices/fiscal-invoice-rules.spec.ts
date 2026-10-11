import {
  EXPENSE_TYPE_CODES,
  expenseCategoryFor,
  invoiceTotal,
  isValidNcf,
  isValidRnc,
  ncfTypeOf,
  normalizeNcf,
  normalizeRnc,
  round2,
} from './fiscal-invoice-rules';

describe('fiscal-invoice-rules', () => {
  describe('NCF', () => {
    it('acepta el comprobante de papel (11) y el electrónico (13)', () => {
      expect(isValidNcf('B0100000012')).toBe(true);
      expect(isValidNcf('B0200000001')).toBe(true);
      expect(isValidNcf('E310000000001')).toBe(true);
      expect(isValidNcf('E320000000123')).toBe(true);
    });

    it('rechaza largos, tipos y letras que no existen', () => {
      expect(isValidNcf('B010000001')).toBe(false); // 10
      expect(isValidNcf('B01000000123')).toBe(false); // 12
      expect(isValidNcf('B9900000012')).toBe(false); // tipo inexistente
      expect(isValidNcf('E3100000012')).toBe(false); // e-CF con 11
      expect(isValidNcf('X0100000012')).toBe(false);
      expect(isValidNcf('')).toBe(false);
    });

    it('normaliza espacios, guiones y minúsculas', () => {
      expect(normalizeNcf(' b01-00000012 ')).toBe('B0100000012');
      expect(isValidNcf(normalizeNcf('e31-0000000001'))).toBe(true); // E31 + 10 dígitos = 13
      expect(isValidNcf(normalizeNcf('e31-00000000001'))).toBe(false); // 14
    });

    it('deduce el tipo del propio NCF', () => {
      expect(ncfTypeOf('B0100000012')).toBe('B01');
      expect(ncfTypeOf('E320000000123')).toBe('E32');
      expect(ncfTypeOf('basura')).toBeNull();
    });
  });

  describe('RNC', () => {
    it('acepta 9 y 11 dígitos, con o sin guiones', () => {
      expect(isValidRnc(normalizeRnc('1-30-99187-3'))).toBe(true);
      expect(isValidRnc(normalizeRnc('001-1234567-8'))).toBe(true);
    });

    it('rechaza otros largos', () => {
      expect(isValidRnc('12345678')).toBe(false);
      expect(isValidRnc('1234567890')).toBe(false);
      expect(isValidRnc('')).toBe(false);
    });
  });

  describe('importes', () => {
    it('suma base + ITBIS + ISC + propina + otros', () => {
      expect(invoiceTotal({ baseAmount: 1000, itbis: 180 })).toBe(1180);
      expect(invoiceTotal({ baseAmount: 100, itbis: 18, isc: 2, tip: 10, otherTax: 0.5 })).toBe(130.5);
    });

    it('redondea a 2 decimales sin error de coma flotante', () => {
      expect(round2(1.005)).toBe(1.01);
      expect(invoiceTotal({ baseAmount: 0.1, itbis: 0.2 })).toBe(0.3);
    });

    it('trata los campos vacíos como cero', () => {
      expect(invoiceTotal({ baseAmount: 50, itbis: null, tip: undefined })).toBe(50);
    });
  });

  it('sugiere la categoría del gasto según el tipo del 606', () => {
    expect(expenseCategoryFor('09')).toBe('materials');
    expect(expenseCategoryFor('10')).toBe('equipment');
    expect(expenseCategoryFor('01')).toBe('labor');
    expect(expenseCategoryFor('02')).toBe('other');
    expect(expenseCategoryFor('99')).toBe('other');
  });

  it('el catálogo de tipos de gasto del 606 va del 01 al 11', () => {
    expect(EXPENSE_TYPE_CODES).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11']);
  });
});
