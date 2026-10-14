/**
 * Teléfono normalizado (ERP-75): solo dígitos, con código de país de RD ("1") si venía de 10 dígitos.
 * La misma regla vive en `normalizePhone` (TypeScript) y en esta expresión SQL, que Postgres usa para
 * mantener la columna `phoneNormalized` (generada y guardada, con índice) sin importar cómo se escriba la fila.
 */
export function phoneNormalizedSql(column: string): string {
  const d = `regexp_replace("${column}", '\\D', '', 'g')`;
  return `CASE WHEN length(${d}) = 10 THEN '1' || ${d} WHEN length(${d}) BETWEEN 11 AND 15 THEN ${d} ELSE NULL END`;
}
