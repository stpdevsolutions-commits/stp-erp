import { BadRequestException } from '@nestjs/common';
import {
  assertNetNotNegative,
  duplicatePayrollMessage,
  findDuplicatePayroll,
  PayrollKeyed,
} from './payroll-guards';

const base: PayrollKeyed = {
  id: 'a',
  number: 'NOM-2026-001',
  status: 'pending',
  collaboratorId: 'c1',
  projectId: 'p1',
  periodStart: '2026-10-05',
  periodEnd: '2026-10-09',
  paymentType: 'day',
};

describe('assertNetNotNegative', () => {
  it('acepta neto cero o positivo', () => {
    expect(() =>
      assertNetNotNegative({ grossAmount: 100, retentionAmount: 0, netAmount: 0 }, 100),
    ).not.toThrow();
  });
  it('rechaza neto negativo con 400 y mensaje claro', () => {
    try {
      assertNetNotNegative({ grossAmount: 1000, retentionAmount: 50, netAmount: -250 }, 1200);
      fail('debió lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as Error).message).toContain('negativo (-250.00)');
    }
  });
});

describe('findDuplicatePayroll', () => {
  const cand = { ...base };
  it('detecta el mismo colaborador+proyecto+período+tipo', () => {
    expect(findDuplicatePayroll(cand, [base])).toBe(base);
  });
  it('ignora cancelados, otro período, otro proyecto, otro tipo y a sí mismo', () => {
    expect(findDuplicatePayroll(cand, [{ ...base, status: 'cancelled' }])).toBeUndefined();
    expect(findDuplicatePayroll(cand, [{ ...base, periodEnd: '2026-10-10' }])).toBeUndefined();
    expect(findDuplicatePayroll(cand, [{ ...base, projectId: 'p2' }])).toBeUndefined();
    expect(findDuplicatePayroll(cand, [{ ...base, paymentType: 'm2' }])).toBeUndefined();
    expect(findDuplicatePayroll(cand, [base], 'a')).toBeUndefined();
  });
  it('trata proyecto vacío y null como el mismo (pago sin obra)', () => {
    const noProject = { ...base, projectId: null };
    expect(findDuplicatePayroll({ ...cand, projectId: undefined }, [noProject])).toBe(noProject);
  });
  it('compara fechas ignorando la hora', () => {
    expect(
      findDuplicatePayroll({ ...cand, periodStart: '2026-10-05T00:00:00.000Z' }, [base]),
    ).toBe(base);
  });
  it('el mensaje cita número y período', () => {
    const msg = duplicatePayrollMessage(base as Required<Pick<PayrollKeyed, 'periodStart' | 'periodEnd'>> & { number: string });
    expect(msg).toContain('NOM-2026-001');
    expect(msg).toContain('2026-10-05 a 2026-10-09');
  });
});
