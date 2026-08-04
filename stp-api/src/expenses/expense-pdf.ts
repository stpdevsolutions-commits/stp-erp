import { join } from 'path';

/**
 * Convención de nombre del PDF de un gasto.
 *
 * Es globalmente único por gasto, y por eso es la clave con la que se busca el registro
 * en `uploaded_files`: el `clientId` o el `projectId` de un gasto pueden cambiar con una
 * edición, el id no. Vivía duplicada en tres sitios del service (generar, buscar y ahora
 * borrar); tenerla en un solo sitio evita que una se desincronice de las otras y deje
 * archivos que nadie encuentra.
 */
export function expensePdfFilename(expenseId: string): string {
  return `GASTO-${expenseId}.pdf`;
}

/**
 * Carpeta del PDF relativa a la raíz de subidas, siguiendo el árbol documentado en
 * CLAUDE.md: `clients/{clientId}/projects/{projectId}/expenses`.
 */
export function expensePdfRelativeDir(clientId: string, projectId: string): string {
  return join('clients', clientId, 'projects', projectId, 'expenses');
}

/** Ruta completa del PDF relativa a la raíz de subidas (lo que se guarda en `path`). */
export function expensePdfRelativePath(
  clientId: string,
  projectId: string,
  expenseId: string,
): string {
  return join(expensePdfRelativeDir(clientId, projectId), expensePdfFilename(expenseId));
}
