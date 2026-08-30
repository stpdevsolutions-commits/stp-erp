export type TicketType = 'bug' | 'mejora' | 'cambio'
export type TicketStatus = 'pending' | 'in_progress' | 'review' | 'done' | 'cancelled'
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface Project {
  id: string
  slug: string
  name: string
  createdAt: string
}

export interface Ticket {
  id: string
  number: number
  projectId: string
  project?: Project
  title: string
  description: string | null
  type: TicketType
  status: TicketStatus
  priority: TicketPriority
  reportedBy: string
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}
