import { QuoteStatus } from './entities/quote.entity';

/**
 * Estados desde los que una cotización puede REVISARSE (emitir rev.N+1):
 * enviada, aprobada (renegociación), rechazada o expirada. Una DRAFT se edita
 * directamente — no se revisa.
 */
export const REVISABLE_STATUSES: readonly QuoteStatus[] = [
  QuoteStatus.SENT,
  QuoteStatus.APPROVED,
  QuoteStatus.REJECTED,
  QuoteStatus.EXPIRED,
];

export function isRevisableStatus(status: QuoteStatus): boolean {
  return REVISABLE_STATUSES.includes(status);
}

/**
 * Número visible de una cotización según su revisión.
 * - revisión 1 (original): el número base tal cual (`COT-2026-001`).
 * - revisión N>1: sufijo `-R{N}` (`COT-2026-001-R2`), único en la BD y sin
 *   romper `generateNumber()` (SPLIT_PART(number,'-',3) sigue siendo la
 *   secuencia `001`).
 */
export function revisionNumber(baseNumber: string, revision: number): string {
  return revision > 1 ? `${baseNumber}-R${revision}` : baseNumber;
}

/** Etiqueta humana de la revisión, p. ej. "Rev. 2". Vacía para la original. */
export function revisionLabel(revision: number): string {
  return revision > 1 ? `Rev. ${revision}` : '';
}
