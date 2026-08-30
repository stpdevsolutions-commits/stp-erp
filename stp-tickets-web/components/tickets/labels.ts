import type { TicketPriority, TicketStatus, TicketType } from '@/lib/types'

export const TYPE_LABELS: Record<TicketType, string> = {
  bug: 'Bug',
  mejora: 'Mejora',
  cambio: 'Cambio',
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  review: 'En revisión',
  done: 'Resuelto',
  cancelled: 'Cancelado',
}

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
}

export const PRIORITY_BADGE: Record<TicketPriority, 'secondary' | 'info' | 'warning' | 'destructive'> = {
  low: 'secondary',
  medium: 'info',
  high: 'warning',
  urgent: 'destructive',
}

export const STATUS_BADGE: Record<TicketStatus, 'secondary' | 'info' | 'success' | 'outline'> = {
  pending: 'secondary',
  in_progress: 'info',
  review: 'info',
  done: 'success',
  cancelled: 'outline',
}
