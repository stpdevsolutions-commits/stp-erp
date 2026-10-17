import {
  amountsForPercents,
  checkSplit,
  describeDifference,
  fromCents,
  mergeSplitLines,
  remainderFor,
  splitByPercent,
  splitEqually,
  sumAmounts,
  toCents,
} from './invoice-split';

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';

describe('invoice-split (ERP-81)', () => {
  describe('céntimos', () => {
    it('convierte sin error de coma flotante', () => {
      expect(toCents(0.1 + 0.2)).toBe(30);
      expect(toCents(1.005)).toBe(101);
      expect(toCents(1234.5)).toBe(123450);
      expect(fromCents(123450)).toBe(1234.5);
    });

    it('suma exacta: 0.1 + 0.2 = 0.3', () => {
      expect(sumAmounts([0.1, 0.2])).toBe(0.3);
      expect(sumAmounts([33.33, 33.33, 33.34])).toBe(100);
    });
  });

  describe('checkSplit', () => {
    it('cuadra cuando la suma es exactamente el total', () => {
      const r = checkSplit(1180, [{ amount: 500.1 }, { amount: 679.9 }]);
      expect(r).toEqual({ ok: true, sum: 1180, difference: 0 });
    });

    it('falta (diferencia positiva) y sobra (negativa), a un céntimo', () => {
      expect(checkSplit(100, [{ amount: 99.99 }])).toMatchObject({ ok: false, difference: 0.01 });
      expect(checkSplit(100, [{ amount: 60 }, { amount: 40.01 }])).toMatchObject({ ok: false, difference: -0.01 });
    });

    it('no se deja engañar por la coma flotante (0.1 + 0.2 contra 0.3)', () => {
      expect(checkSplit(0.3, [{ amount: 0.1 }, { amount: 0.2 }]).ok).toBe(true);
    });
  });

  describe('describeDifference', () => {
    it('dice Falta / Sobra / Cuadra', () => {
      expect(describeDifference(0)).toBe('Cuadra');
      expect(describeDifference(1250.5)).toBe('Falta RD$ 1,250.50');
      expect(describeDifference(-0.01)).toBe('Sobra RD$ 0.01');
    });
  });

  describe('mergeSplitLines (el mismo destino se fusiona)', () => {
    it('suma los montos del mismo proyecto y une las notas, conservando el orden', () => {
      const merged = mergeSplitLines([
        { projectId: P1, amount: 100.1, note: 'cable' },
        { projectId: null, amount: 50 },
        { projectId: P1, amount: 0.2, note: 'tornillos' },
        { projectId: P1, amount: 10, note: 'cable' },
      ]);
      expect(merged).toEqual([
        { projectId: P1, amount: 110.3, note: 'cable; tornillos' },
        { projectId: null, amount: 50, note: null },
      ]);
    });

    it('gasto general (null) y proyecto no se confunden', () => {
      const merged = mergeSplitLines([
        { projectId: null, amount: 1 },
        { projectId: P2, amount: 2 },
      ]);
      expect(merged).toHaveLength(2);
    });
  });

  describe('splitEqually', () => {
    it('divide exacto', () => {
      expect(splitEqually(300, 3)).toEqual([100, 100, 100]);
    });

    it('los céntimos sobrantes van a las primeras líneas y la suma es exacta', () => {
      const parts = splitEqually(100, 3);
      expect(parts).toEqual([33.34, 33.33, 33.33]);
      expect(sumAmounts(parts)).toBe(100);
    });

    it('con totales raros la suma siempre es el total', () => {
      for (const [total, n] of [[0.05, 3], [1234.57, 7], [99999.99, 4], [1, 6]] as const) {
        expect(sumAmounts(splitEqually(total, n))).toBe(total);
      }
    });

    it('rechaza partes inválidas', () => {
      expect(() => splitEqually(100, 0)).toThrow();
      expect(() => splitEqually(100, 1.5)).toThrow();
    });
  });

  describe('splitByPercent', () => {
    it('50/50 y 25/75', () => {
      expect(splitByPercent(1000, [50, 50])).toEqual([500, 500]);
      expect(splitByPercent(1000, [25, 75])).toEqual([250, 750]);
    });

    it('la última línea absorbe el céntimo de redondeo', () => {
      // 100 × 33.33 % = 33.33 ; 33.33 ; el resto (33.34) a la última.
      const parts = splitByPercent(100, [33.33, 33.33, 33.34]);
      expect(parts).toEqual([33.33, 33.33, 33.34]);
      // 3 partes de un tercio sobre 0.10: 0.03 + 0.03 y la última absorbe 0.04
      const t = splitByPercent(0.1, [33.33, 33.33, 33.34]);
      expect(sumAmounts(t)).toBe(0.1);
    });

    it('la suma da siempre el total aunque el redondeo se desvíe', () => {
      for (const total of [0.01, 7.77, 1180, 54321.99]) {
        expect(sumAmounts(splitByPercent(total, [10.5, 20.25, 69.25]))).toBe(total);
      }
    });

    it('exige que los porcentajes sumen 100 y no sean negativos', () => {
      expect(() => splitByPercent(100, [50, 40])).toThrow('sumar 100');
      expect(() => splitByPercent(100, [120, -20])).toThrow('negativos');
      expect(() => splitByPercent(100, [])).toThrow();
    });
  });

  describe('amountsForPercents (lo que se ve mientras se teclea)', () => {
    it('con los porcentajes en 100 reparte exacto y la última absorbe el céntimo', () => {
      const a = amountsForPercents(100, [33.33, 33.33, 33.34]);
      expect(sumAmounts(a)).toBe(100);
      expect(amountsForPercents(0.1, [33.33, 33.33, 33.34]).reduce((x, y) => x + y, 0)).toBeCloseTo(0.1, 10);
    });

    it('mientras no suman 100 solo calcula cada monto, sin forzar (queda Falta)', () => {
      expect(amountsForPercents(1000, [50, 20])).toEqual([500, 200]);
      expect(checkSplit(1000, amountsForPercents(1000, [50, 20].map((x) => x)).map((amount) => ({ amount }))).difference).toBe(300);
    });

    it('vacíos o inválidos cuentan como 0', () => {
      expect(amountsForPercents(1000, [Number.NaN, 25])).toEqual([0, 250]);
    });
  });

  describe('remainderFor ("lo que falta va a esta línea")', () => {
    it('calcula lo que le toca a una línea para completar el total', () => {
      expect(remainderFor(1000, [300, 200, 0], 2)).toBe(500);
      expect(remainderFor(1000, [300, 800, 0], 2)).toBe(-100);
      expect(remainderFor(0.3, [0.1, 0], 1)).toBe(0.2);
    });
  });
});
