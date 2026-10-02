import { formatRD } from './money';

describe('formatRD', () => {
  it('separa miles y deja dos decimales', () => {
    expect(formatRD(1234.5)).toBe('RD$ 1,234.50');
    expect(formatRD(258550.83)).toBe('RD$ 258,550.83');
  });
  it('redondea a centavos y trata vacío como cero', () => {
    expect(formatRD(0.005)).toBe('RD$ 0.01');
    expect(formatRD(null)).toBe('RD$ 0.00');
  });
  it('negativos', () => {
    expect(formatRD(-1500)).toBe('RD$ -1,500.00');
  });
});
