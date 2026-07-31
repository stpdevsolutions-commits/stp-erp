import { computePayrollAmounts } from './payroll-amounts';

describe('computePayrollAmounts', () => {
  it('calcula bruto = días × tarifa + extras + bonos y neto = bruto − descuentos', () => {
    expect(
      computePayrollAmounts({
        daysWorked: 12,
        dailyRate: 1500,
        overtimeAmount: 2000,
        bonuses: 500,
        deductions: 3000,
      }),
    ).toEqual({ grossAmount: 20500, netAmount: 17500 });
  });

  it('trata como cero los campos vacíos o nulos', () => {
    expect(computePayrollAmounts({})).toEqual({ grossAmount: 0, netAmount: 0 });
    expect(
      computePayrollAmounts({ daysWorked: null, dailyRate: 1500, bonuses: 800 }),
    ).toEqual({ grossAmount: 800, netAmount: 800 });
  });

  it('redondea a 2 decimales sin arrastrar error binario', () => {
    // 5.5 × 1234.57 = 6790.135 en decimal, 6790.134999... en binario
    const { grossAmount } = computePayrollAmounts({ daysWorked: 5.5, dailyRate: 1234.57 });
    expect(grossAmount).toBe(6790.14);
  });

  it('permite neto negativo si los descuentos superan el bruto', () => {
    // No se recorta a cero a propósito: un neto negativo es un dato erróneo que
    // debe verse, no un descuento silenciado.
    expect(computePayrollAmounts({ daysWorked: 1, dailyRate: 1000, deductions: 1500 })).toEqual({
      grossAmount: 1000,
      netAmount: -500,
    });
  });

  it('ignora valores no finitos en vez de propagar NaN', () => {
    expect(
      computePayrollAmounts({ daysWorked: NaN, dailyRate: 1500, bonuses: 100 }),
    ).toEqual({ grossAmount: 100, netAmount: 100 });
  });
});
