import { Logger } from '@nestjs/common';

const logger = new Logger('Audit');

/**
 * Registro mínimo de acciones sensibles (borrados, cambios de rol) en el log del
 * servidor: no hay tabla ni pantalla propia — es lo mínimo para poder responder
 * "¿quién hizo esto y cuándo" revisando logs, sin construir un subsistema de
 * auditoría completo para lo que el informe marcó como mejora de baja prioridad.
 */
export function auditLog(
  actorId: string | undefined,
  action: string,
  detail: Record<string, unknown> = {},
): void {
  logger.log(`${action} actor=${actorId ?? 'desconocido'} ${JSON.stringify(detail)}`);
}
