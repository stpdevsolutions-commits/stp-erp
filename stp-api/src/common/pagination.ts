/** Cota la página a un entero >= 1; un valor inválido, vacío o negativo cae a 1. */
export function clampPage(value: unknown): number {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/**
 * Cota el límite de página entre 1 y `max` (100 por defecto). Sin esto, un
 * `?limit=999999` fuerza al backend a traer y serializar toda la tabla en una sola
 * respuesta — un costo que cualquier cliente autenticado puede disparar a voluntad,
 * no algo que dependa de un error de uso.
 */
export function clampLimit(value: unknown, fallback = 20, max = 100): number {
  const n = parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}
