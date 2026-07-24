import { UserRole } from '../../users/entities/user.entity';

/**
 * ────────────────────────────────────────────────────────────────────────────
 *  POLÍTICA DE ACCESO — función de decisión pura, sin base de datos.
 * ────────────────────────────────────────────────────────────────────────────
 *  Este archivo es el ÚNICO sitio donde se decide si un usuario puede o no
 *  acceder a un recurso ligado a un cliente/proyecto. Todo lo demás (guard,
 *  servicios, filtros de listados) se limita a alimentar esta función.
 *
 *  Reglas:
 *   · ADMIN y MANAGER: acceso total, siempre (nunca pueden quedar bloqueados).
 *   · USER: solo clientes y proyectos donde esté asignado, más lo que él mismo
 *     creó/subió (`ownerId`), para que nadie pierda acceso a su propio trabajo.
 */

/** Tipos de recurso que el guard sabe resolver. */
export type ResourceKind =
  | 'client'
  | 'project'
  | 'file'
  | 'quote'
  | 'payment'
  | 'expense'
  | 'ficha';

export interface AccessSubject {
  id: string;
  role: UserRole | string;
}

/** Conjuntos de pertenencia de un usuario, ya materializados. */
export interface Membership {
  /** Clientes asignados explícitamente (tabla `client_members`). */
  clientIds: ReadonlySet<string>;
  /** Proyectos asignados (tabla `project_members` + `projects.assignedToId`). */
  projectIds: ReadonlySet<string>;
  /** Clientes dueños de esos proyectos (acceso derivado, solo de lectura del cliente). */
  projectClientIds: ReadonlySet<string>;
}

/** Descripción del recurso al que se quiere acceder. */
export interface ResourceScope {
  kind: ResourceKind;
  clientId?: string | null;
  projectId?: string | null;
  /** Usuario que creó/subió el recurso (uploadedById, technicianId…). */
  ownerId?: string | null;
  /**
   * Solo para `kind: 'client'`. Si es true exige pertenencia explícita al
   * cliente; no basta con ser miembro de uno de sus proyectos. Se usa para los
   * documentos a nivel de cliente (contratos, comprobantes de pago…).
   */
  strictClient?: boolean;
}

/** Roles que atraviesan cualquier comprobación de pertenencia. */
export const UNRESTRICTED_ROLES: readonly string[] = [
  UserRole.ADMIN,
  UserRole.MANAGER,
];

/**
 * Sujeto para llamadas internas del sistema (cron, notificaciones, informes
 * automáticos) que no ocurren dentro de una petición HTTP autenticada.
 * Los filtros de listado son *fail-closed*: sin sujeto no se devuelve nada,
 * así que un servicio interno que necesite ver todo debe pasar esto.
 */
export const SYSTEM_SUBJECT: AccessSubject = {
  id: 'system',
  role: UserRole.ADMIN,
};

export const EMPTY_MEMBERSHIP: Membership = {
  clientIds: new Set<string>(),
  projectIds: new Set<string>(),
  projectClientIds: new Set<string>(),
};

export function hasUnrestrictedAccess(
  role: UserRole | string | undefined | null,
): boolean {
  return !!role && UNRESTRICTED_ROLES.includes(role);
}

/**
 * Decide si `subject` puede acceder a `resource` dadas sus pertenencias.
 * Función pura: mismo input → mismo output. Testeada en access-policy.spec.ts.
 */
export function decideAccess(
  subject: AccessSubject | null | undefined,
  membership: Membership,
  resource: ResourceScope | null | undefined,
): boolean {
  if (!subject) return false;

  // ADMIN / MANAGER: acceso total, pasando por el mismo mecanismo.
  if (hasUnrestrictedAccess(subject.role)) return true;

  // Recurso inexistente o sin ámbito conocido → denegado (el guard responde 404).
  if (!resource) return false;

  // Lo que el propio usuario creó o subió siempre le pertenece.
  if (resource.ownerId && resource.ownerId === subject.id) return true;

  const clientId = resource.clientId ?? null;
  const projectId = resource.projectId ?? null;

  // El registro del cliente en sí: basta pertenecer a uno de sus proyectos
  // (hace falta para poder ver el nombre del cliente del proyecto asignado),
  // salvo que se pida pertenencia estricta.
  if (resource.kind === 'client') {
    if (!clientId) return false;
    if (membership.clientIds.has(clientId)) return true;
    return !resource.strictClient && membership.projectClientIds.has(clientId);
  }

  // Recurso con proyecto: vale la pertenencia al proyecto o a su cliente.
  if (projectId) {
    if (membership.projectIds.has(projectId)) return true;
    return !!clientId && membership.clientIds.has(clientId);
  }

  // Recurso solo a nivel de cliente: exige pertenencia explícita al cliente.
  if (clientId) return membership.clientIds.has(clientId);

  return false;
}

/** Ámbito para filtrar listados. `null` = sin restricciones (ADMIN/MANAGER). */
export interface ListScope {
  clientIds: string[];
  projectIds: string[];
  /** clientIds ∪ clientes de los proyectos asignados. */
  visibleClientIds: string[];
}

export function buildListScope(
  subject: AccessSubject | null | undefined,
  membership: Membership,
): ListScope | null {
  if (subject && hasUnrestrictedAccess(subject.role)) return null;
  const clientIds = [...membership.clientIds];
  return {
    clientIds,
    projectIds: [...membership.projectIds],
    visibleClientIds: [
      ...new Set([...clientIds, ...membership.projectClientIds]),
    ],
  };
}
