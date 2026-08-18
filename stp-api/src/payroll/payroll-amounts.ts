/**
 * Cálculo de los importes de un pago de nómina. Función pura y sin dependencias
 * para poder probarla sola: el servicio SIEMPRE la usa para fijar `grossAmount`
 * y `netAmount`, nunca acepta esos valores del cliente.
 */
export interface PayrollAmountsInput {
  daysWorked?: number | null;
  dailyRate?: number | null;
  overtimeAmount?: number | null;
  bonuses?: number | null;
  deductions?: number | null;
  retentionPercent?: number | null;
}

export interface PayrollAmounts {
  grossAmount: number;
  retentionAmount: number;
  netAmount: number;
}

/**
 * Redondea a 2 decimales. El `toPrecision(12)` intermedio quita el ruido binario
 * (5.5 × 1234.57 da 6790.134999… en coma flotante) para que el medio centavo se
 * redondee hacia arriba como en decimal.
 */
const round2 = (v: number): number => Math.round(Number(v.toPrecision(12)) * 100) / 100;
const num = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

export function computePayrollAmounts(input: PayrollAmountsInput): PayrollAmounts {
  const base = round2(num(input.daysWorked) * num(input.dailyRate));
  const gross = round2(base + num(input.overtimeAmount) + num(input.bonuses));
  // La retención es un porcentaje del BRUTO (el monto total del período), no de
  // lo que queda tras los descuentos: los avances ya entregados no deben reducir
  // la base sobre la que se retiene.
  const retention = round2((gross * num(input.retentionPercent)) / 100);
  const net = round2(gross - num(input.deductions) - retention);
  return { grossAmount: gross, retentionAmount: retention, netAmount: net };
}
