import { ServiceUnavailableException } from '@nestjs/common';

/**
 * Error del escaneo con IA que dice si vale la pena reintentar: saturación (429/500/502/503/504) o
 * timeout sí; credenciales, saldo o petición mala (400/401/403) no, por mucho que se repita.
 */
export class ScanUnavailableException extends ServiceUnavailableException {
  constructor(
    message: string,
    readonly transient: boolean,
  ) {
    super(message);
  }
}

const TRANSIENT_STATUS = /\b(429|500|502|503|504)\b/;
const TRANSIENT_TEXT =
  /unavailable|overloaded|high demand|resource.?exhausted|rate.?limit|quota|timed? ?out|timeout|aborted|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|fetch failed|socket hang up/i;
const PERMANENT_STATUS = /\b(400|401|403)\b/;

/** ¿Este detalle técnico (mensaje del SDK o "HTTP 503: …") corresponde a un fallo pasajero? */
export function isTransientDetail(detail: string, status?: number): boolean {
  if (status !== undefined) {
    if ([429, 500, 502, 503, 504].includes(status)) return true;
    if ([400, 401, 403].includes(status)) return false;
  }
  if (PERMANENT_STATUS.test(detail) && !TRANSIENT_STATUS.test(detail)) return false;
  return TRANSIENT_STATUS.test(detail) || TRANSIENT_TEXT.test(detail);
}

/** ¿Vale la pena reintentar con este error? (Un 503 genérico sin marca se trata como pasajero.) */
export function isTransientScanError(err: unknown): boolean {
  if (err instanceof ScanUnavailableException) return err.transient;
  return err instanceof ServiceUnavailableException;
}

/** Espera antes del reintento `attempt` (1, 2, 3…): exponencial con jitter de ±25 %, tope 90 s. */
export function retryDelayMs(attempt: number, baseMs = 5_000, rng: () => number = Math.random): number {
  const exp = Math.min(baseMs * 2 ** (attempt - 1), 90_000);
  return Math.round(exp * (0.75 + rng() * 0.5));
}
