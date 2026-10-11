import { extractJsonObject, matchesMagic, normalizeScan, validIsoDate, type RawScan } from './invoice-scan';

const raw = (over: RawScan = {}): RawScan => ({
  supplierName: 'FERRETERIA UNO SRL',
  supplierRnc: '130991873',
  ncf: 'B0100000012',
  invoiceDate: '2026-10-05',
  baseAmount: 1000,
  itbis: 180,
  isc: 0,
  tip: 0,
  otherTax: 0,
  totalAmount: 1180,
  paymentMethod: '02',
  expenseType: '09',
  securityCode: null,
  notes: 'cable UTP',
  confidence: 'high',
  missing: [],
  ...over,
});

describe('invoice-scan', () => {
  describe('extractJsonObject', () => {
    it('saca el JSON de una cerca ```json', () => {
      expect(JSON.parse(extractJsonObject('```json\n{"a":1}\n```'))).toEqual({ a: 1 });
    });
    it('descarta una llave de más al final (lo que a veces hace Gemini)', () => {
      expect(JSON.parse(extractJsonObject('{"a":{"b":2}}}'))).toEqual({ a: { b: 2 } });
    });
    it('no se confunde con llaves dentro de un texto', () => {
      expect(JSON.parse(extractJsonObject('{"nota":"cerró } la llave","x":1}'))).toEqual({ nota: 'cerró } la llave', x: 1 });
    });
    it('sin JSON devuelve el texto tal cual', () => {
      expect(extractJsonObject('no hay nada')).toBe('no hay nada');
    });
  });

  describe('normalizeScan — una lectura buena', () => {
    it('pasa los campos sin avisos', () => {
      const r = normalizeScan(raw());
      expect(r.fields).toMatchObject({
        ncf: 'B0100000012',
        supplierRnc: '130991873',
        supplierName: 'FERRETERIA UNO SRL',
        invoiceDate: '2026-10-05',
        baseAmount: 1000,
        itbis: 180,
        paymentMethod: '02',
        expenseType: '09',
        notes: 'cable UTP',
      });
      expect(r.totalAmount).toBe(1180);
      expect(r.confidence).toBe('high');
      expect(r.warnings).toEqual([]);
    });
  });

  describe('normalizeScan — lo dudoso se avisa, no se corrige a escondidas', () => {
    it('normaliza NCF y RNC que vienen con guiones y minúsculas', () => {
      const r = normalizeScan(raw({ ncf: 'b01-00000012', supplierRnc: '1-30-99187-3' }));
      expect(r.fields.ncf).toBe('B0100000012');
      expect(r.fields.supplierRnc).toBe('130991873');
      expect(r.warnings).toEqual([]);
    });

    it('un NCF mal formado se conserva pero con aviso', () => {
      const r = normalizeScan(raw({ ncf: 'B01000012' }));
      expect(r.fields.ncf).toBe('B01000012');
      expect(r.warnings.join(' ')).toContain('no tiene un formato válido');
    });

    it('sin NCF ni RNC pide escribirlos a mano', () => {
      const r = normalizeScan(raw({ ncf: null, supplierRnc: null }));
      expect(r.fields.ncf).toBe('');
      expect(r.warnings.join(' ')).toContain('NCF');
      expect(r.warnings.join(' ')).toContain('RNC');
    });

    it('un RNC de largo raro avisa', () => {
      expect(normalizeScan(raw({ supplierRnc: '1234567' })).warnings.join(' ')).toContain('9 u 11 dígitos');
    });

    it('no inventa la fecha: una ilegible o imposible queda en null con aviso', () => {
      for (const bad of [null, '', '05/10/2026', '2026-02-31', '2099-01-01']) {
        const r = normalizeScan(raw({ invoiceDate: bad }));
        expect(r.fields.invoiceDate).toBeNull();
        expect(r.warnings.join(' ')).toContain('fecha');
      }
    });

    it('avisa cuando base + impuestos no cuadran con el total', () => {
      const r = normalizeScan(raw({ baseAmount: 1000, itbis: 180, totalAmount: 1500 }));
      expect(r.warnings.join(' ')).toContain('no cuadran');
      expect(r.fields.baseAmount).toBe(1000); // no se toca lo leído
    });

    it('tolera 1 peso de diferencia por redondeo', () => {
      expect(normalizeScan(raw({ totalAmount: 1180.8 })).warnings).toEqual([]);
    });

    it('si la base vino en 0 pero se leyó el total, la deduce y lo dice', () => {
      const r = normalizeScan(raw({ baseAmount: 0, totalAmount: 1180 }));
      expect(r.fields.baseAmount).toBe(1000);
      expect(r.warnings.join(' ')).toContain('se calculó');
    });

    it('sin ningún monto avisa', () => {
      const r = normalizeScan(raw({ baseAmount: 0, itbis: 0, totalAmount: null }));
      expect(r.warnings.join(' ')).toContain('ningún monto');
    });

    it('montos como texto con comas, negativos y basura se limpian', () => {
      const r = normalizeScan(raw({ baseAmount: '1,000.50', itbis: -5, isc: 'abc', totalAmount: null }));
      expect(r.fields.baseAmount).toBe(1000.5);
      expect(r.fields.itbis).toBe(0);
      expect(r.fields.isc).toBe(0);
    });
  });

  describe('normalizeScan — catálogos', () => {
    it('forma de pago desconocida → 01', () => {
      expect(normalizeScan(raw({ paymentMethod: 'efectivo' })).fields.paymentMethod).toBe('01');
    });

    it('tipo de gasto fuera del 606 (12, 99, vacío) → null, para que lo elija una persona', () => {
      for (const t of ['12', '99', '', null, 'x']) {
        expect(normalizeScan(raw({ expenseType: t })).fields.expenseType).toBeNull();
      }
      expect(normalizeScan(raw({ expenseType: '10' })).fields.expenseType).toBe('10');
    });

    it('el código de seguridad solo cuenta en un e-CF y si tiene forma de código', () => {
      expect(normalizeScan(raw({ ncf: 'E310000000001', securityCode: 'aB3d9Z' })).fields.securityCode).toBe('aB3d9Z');
      expect(normalizeScan(raw({ ncf: 'B0100000012', securityCode: 'aB3d9Z' })).fields.securityCode).toBeNull();
      expect(normalizeScan(raw({ ncf: 'E310000000001', securityCode: 'ab' })).fields.securityCode).toBeNull();
    });

    it('confianza desconocida → medium; missing solo guarda textos', () => {
      const r = normalizeScan(raw({ confidence: 'rarísima', missing: ['fecha', 3, '', null] }));
      expect(r.confidence).toBe('medium');
      expect(r.missing).toEqual(['fecha']);
    });
  });

  describe('validIsoDate', () => {
    it('acepta fechas reales y rechaza las imposibles', () => {
      expect(validIsoDate('2026-10-05')).toBe('2026-10-05');
      expect(validIsoDate('2026-02-30')).toBeNull();
      expect(validIsoDate('2026-13-01')).toBeNull();
    });
  });

  describe('matchesMagic', () => {
    it('reconoce los bytes de cada tipo y rechaza lo que no coincide', () => {
      expect(matchesMagic(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]), 'image/jpeg')).toBe(true);
      expect(matchesMagic(Buffer.from('\x89PNG\r\n\x1a\n', 'binary'), 'image/png')).toBe(true);
      expect(matchesMagic(Buffer.from('%PDF-1.7'), 'application/pdf')).toBe(true);
      expect(matchesMagic(Buffer.from('RIFF\0\0\0\0WEBPVP8 '), 'image/webp')).toBe(true);
      expect(matchesMagic(Buffer.from('%PDF-1.7'), 'image/png')).toBe(false);
      expect(matchesMagic(Buffer.from('texto'), 'image/jpeg')).toBe(false);
      expect(matchesMagic(Buffer.from('x'), 'text/plain')).toBe(false);
    });
  });
});
