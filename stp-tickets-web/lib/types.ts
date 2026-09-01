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
