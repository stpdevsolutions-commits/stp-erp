import type { SprintStatus } from '@/lib/types'

export const SPRINT_STATUS_LABELS: Record<SprintStatus, string> = {
  planned: 'Planificada',
  active: 'En marcha',
  done: 'Cerrada',
  cancelled: 'Cancelada',
}

/** Variantes del Badge de la app (components/ui/badge.tsx). El estado nunca
 * se comunica solo por color: siempre va el texto de arriba al lado. */
export const SPRINT_STATUS_BADGE: Record<SprintStatus, 'secondary' | 'info' | 'success' | 'outline'> = {
  planned: 'secondary',
  active: 'info',
  done: 'success',
  cancelled: 'outline',
}

/** Color de la barra en el timeline. Tokens de la marca (globals.css):
 * navy = --primary, verde = --chart-2. La planificada va en hueco (solo
 * borde), la cancelada en gris tenue. */
export const SPRINT_BAR: Record<SprintStatus, { fill: string; track: string; muted?: boolean }> = {
  planned: { fill: 'var(--muted-foreground)', track: 'var(--muted)', muted: true },
  active: { fill: 'var(--primary)', track: 'color-mix(in oklch, var(--primary) 14%, transparent)' },
  done: { fill: 'var(--chart-2)', track: 'color-mix(in oklch, var(--chart-2) 14%, transparent)' },
  cancelled: { fill: 'var(--muted-foreground)', track: 'var(--muted)', muted: true },
}
