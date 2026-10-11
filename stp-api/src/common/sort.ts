export type SortOrder = 'ASC' | 'DESC';

/**
 * Ordenamiento de listados pedido por el cliente (`?sort=campo&dir=asc|desc`).
 * Solo se acepta lo que está en la lista blanca `allowed` (campo público -> columna/propiedad);
 * cualquier otro valor se ignora y el listado conserva su orden por defecto.
 */
export function parseSort(
  sort: string | undefined,
  dir: string | undefined,
  allowed: Record<string, string>,
): { column: string; order: SortOrder } | null {
  if (!sort || !Object.prototype.hasOwnProperty.call(allowed, sort)) return null;
  return { column: allowed[sort], order: dir?.toLowerCase() === 'desc' ? 'DESC' : 'ASC' };
}
