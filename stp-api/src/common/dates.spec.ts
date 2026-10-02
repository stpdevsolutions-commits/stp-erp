import { formatDateRD, monthStartRD, todayRD, yearStartRD } from './dates';

describe('fechas en hora de RD (UTC-4)', () => {
  it('a las 8:30 pm de RD sigue siendo el mismo día aunque en UTC ya sea mañana', () => {
    const noche = new Date('2026-10-02T00:30:00Z'); // 1/10 20:30 en RD
    expect(todayRD(noche)).toBe('2026-10-01');
    expect(formatDateRD(noche)).toBe('01/10/2026');
  });
  it('después de medianoche en RD ya es el día siguiente', () => {
    expect(todayRD(new Date('2026-10-02T05:00:00Z'))).toBe('2026-10-02');
  });
  it('inicio de mes y de año según RD', () => {
    const finDeAnio = new Date('2027-01-01T02:00:00Z'); // 31/12 22:00 en RD
    expect(monthStartRD(finDeAnio)).toBe('2026-12-01');
    expect(yearStartRD(finDeAnio)).toBe('2026-01-01');
  });
});
