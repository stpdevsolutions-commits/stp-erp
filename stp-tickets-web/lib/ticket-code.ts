import type { Project, Ticket } from '@/lib/types'

/** "FRD-7" si el proyecto ya tiene código, o "#7" (número global) si por lo
 * que sea no vino el proyecto en la respuesta — nunca deja la celda vacía. */
export function ticketCode(t: Ticket, project?: Project | null): string {
  if (project?.code && t.projectNumber != null) return `${project.code}-${t.projectNumber}`
  return `#${t.number}`
}

/** Estados que cuentan como trabajo abierto. */
export const OPEN_STATUSES = ['pending', 'in_progress', 'review'] as const
export const isOpen = (t: Ticket) => (OPEN_STATUSES as readonly string[]).includes(t.status)
