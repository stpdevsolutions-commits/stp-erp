/**
 * Escapa `%`, `_` y `\` antes de meter un término de búsqueda en un patrón
 * ILIKE/LIKE. Sin esto, buscar literalmente "50%" o "plan_a" se interpreta
 * como comodines de SQL (cualquier cosa / un carácter cualquiera) y devuelve
 * más — o menos — de lo que el usuario escribió.
 */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
