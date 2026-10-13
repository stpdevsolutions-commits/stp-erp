import { ConflictException } from '@nestjs/common';

/**
 * ¿El error es una violación de UNIQUE de Postgres (23505)? TypeORM copia el
 * `code` del driver en el propio QueryFailedError, pero se mira también
 * `driverError` por si llega envuelto.
 */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; driverError?: { code?: string } } | null | undefined;
  return e?.code === '23505' || e?.driverError?.code === '23505';
}

/**
 * Los códigos correlativos (PRJ-2026-004, NOM-2026-012…) se calculan como MAX+1 sin
 * bloqueo: dos creaciones simultáneas pueden calcular el mismo y la segunda choca con el
 * UNIQUE. Esta función repite la operación completa (recalcular código + guardar) hasta
 * `attempts` veces ante ese choque; cualquier otro error se propaga tal cual.
 *
 * `operation` debe recalcular el código en CADA llamada y no dejar efectos si falla (si
 * va dentro de una transacción, envolver la transacción entera, no un solo INSERT:
 * en Postgres un error aborta la transacción en curso).
 */
export async function retryOnUniqueViolation<T>(
  operation: (attempt: number) => Promise<T>,
  options: { attempts?: number; label?: string } = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 5);
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation(attempt);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      if (attempt === attempts) {
        throw new ConflictException(
          `No se pudo generar un código único para ${options.label ?? 'el registro'} tras ${attempts} intentos; intenta de nuevo`,
        );
      }
    }
  }
  /* istanbul ignore next: inalcanzable, el bucle siempre retorna o lanza */
  throw new ConflictException('No se pudo generar un código único');
}

/** Atajo: genera el código y guarda, recalculando el código si otro lo tomó antes. */
export function saveWithUniqueCode<T>(
  generate: () => Promise<string>,
  save: (code: string) => Promise<T>,
  options: { attempts?: number; label?: string } = {},
): Promise<T> {
  return retryOnUniqueViolation(async () => save(await generate()), options);
}
