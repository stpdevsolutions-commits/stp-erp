export type TicketType = 'bug' | 'mejora' | 'cambio' | 'desarrollo'
export type TicketStatus = 'pending' | 'in_progress' | 'review' | 'done' | 'cancelled'
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface Project {
  id: string
  slug: string
  name: string
  code: string
  createdAt: string
}

export interface Ticket {
  id: string
  number: number
  projectNumber: number | null
  projectId: string | null
  project?: Project | null
  sprintId: string | null
  title: string
  description: string | null
  type: TicketType
  status: TicketStatus
  priority: TicketPriority
  reportedBy: string
  assignedTo: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface TicketComment {
  id: string
  ticketId: string
  body: string
  author: string
  createdAt: string
}

// ── Etapas / roadmap ───────────────────────────────────────────────────────

export type SprintStatus = 'planned' | 'active' | 'done' | 'cancelled'

/** Conteo de los tickets de una etapa por estado. Lo calcula el backend a
 * partir de los tickets reales — nunca se guarda, así no se desincroniza. */
export interface SprintStats {
  total: number
  done: number
  inProgress: number
  review: number
  pending: number
  cancelled: number
}

export interface Sprint {
  id: string
  name: string
  goal: string | null
  startDate: string
  endDate: string
  status: SprintStatus
  projectId: string | null
  project?: Project | null
  position: number
  createdAt: string
  updatedAt: string
  stats: SprintStats
}
