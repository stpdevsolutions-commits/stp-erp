import { BadRequestException } from '@nestjs/common';
import { PayrollStatus } from './entities/payroll-entry.entity';

/** Lo que identifica un pago: mismo colaborador, proyecto, período y tipo de pago. */
export interface PayrollKey {
  collaboratorId: string;
  projectId?: string | null;
  periodStart: string;
  periodEnd: string;
  paymentType: string;
}

export interface PayrollKeyed extends PayrollKey {
  id?: string;
  number?: string;
  status?: PayrollStatus | string;
}

const day = (d: string): string => String(d).slice(0, 10);

/**
 * Busca entre `existing` un pago que sea el mismo que `candidate` (colaborador +
 * proyecto + período exacto + tipo de pago). Ignora los cancelados y a sí mismo
 * (`ignoreId`, para las ediciones).
 */
export function findDuplicatePayroll<T extends PayrollKeyed>(
  candidate: PayrollKey,
  existing: T[],
  ignoreId?: string,
): T | undefined {
  return existing.find(
    (e) =>
      e.id !== ignoreId &&
      e.status !== PayrollStatus.CANCELLED &&
      e.collaboratorId === candidate.collaboratorId &&
      (e.projectId ?? null) === (candidate.projectId ?? null) &&
      day(e.periodStart) === day(candidate.periodStart) &&
      day(e.periodEnd) === day(candidate.periodEnd) &&
      e.paymentType === candidate.paymentType,
  );
}

export function duplicatePayrollMessage(dup: {
  number?: string;
  periodStart: string;
  periodEnd: string;
}): string {
  return (
    `Ya existe el pago${dup.number ? ` ${dup.number}` : ''} de este colaborador para el mismo ` +
    `proyecto y período (${day(dup.periodStart)} a ${day(dup.periodEnd)}). ` +
    'Si es otro pago distinto, cambia el período o el tipo de pago; si no, edita el existente.'
  );
}

/**
 * El neto no puede ser negativo: significaría que los descuentos (incluida la cuota
 * del préstamo) y la retención superan lo devengado.
 */
export function assertNetNotNegative(
  amounts: { grossAmount: number; retentionAmount: number; netAmount: number },
  deductions: number,
): void {
  if (amounts.netAmount < 0) {
    throw new BadRequestException(
      `El neto a pagar sería negativo (${amounts.netAmount.toFixed(2)}): el bruto es ` +
        `${amounts.grossAmount.toFixed(2)} y los descuentos (${deductions.toFixed(2)}, incluida ` +
        `la cuota de préstamo si la hay) más la retención (${amounts.retentionAmount.toFixed(2)}) lo superan. ` +
        'Reduce los descuentos o aumenta el monto.',
    );
  }
}
