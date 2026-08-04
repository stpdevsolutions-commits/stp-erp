import type { PriceImportLineStatus, PriceImportStatus } from '@/lib/types'

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive' | 'success' | 'warning' | 'info'

export const IMPORT_STATUS: Record<
  PriceImportStatus,
  { label: string; variant: BadgeVariant }
> = {
  pending: { label: 'En cola', variant: 'secondary' },
  processing: { label: 'Extrayendo…', variant: 'info' },
  review: { label: 'Por revisar', variant: 'warning' },
  done: { label: 'Revisado', variant: 'success' },
  failed: { label: 'Falló', variant: 'destructive' },
}

export const LINE_STATUS: Record<
  PriceImportLineStatus,
  { label: string; variant: BadgeVariant }
> = {
  pending: { label: 'Pendiente', variant: 'outline' },
  approved: { label: 'Aprobada', variant: 'success' },
  rejected: { label: 'Descartada', variant: 'secondary' },
}
