import * as React from 'react'
import { Inbox, SearchX } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

/**
 * Estado vacío del ERP: dice qué falta, por qué puede ser y, cuando se puede, ofrece la
 * acción para crear el primer registro. Con `filtered` el mensaje cambia a "ningún resultado"
 * (el módulo tiene datos, lo que no hay es coincidencias) y no se ofrece crear nada.
 */
export function EmptyState({
  title,
  hint,
  action,
  icon,
  filtered = false,
  className,
}: {
  title: React.ReactNode
  hint?: React.ReactNode
  action?: React.ReactNode
  icon?: LucideIcon
  filtered?: boolean
  className?: string
}) {
  const Icon = icon ?? (filtered ? SearchX : Inbox)
  return (
    <div className={cn('flex flex-col items-center gap-3 px-4 py-10 text-center', className)}>
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
        <Icon className="size-6" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {(hint || filtered) && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            {hint ?? 'Prueba quitando algún filtro o cambiando la búsqueda.'}
          </p>
        )}
      </div>
      {action && !filtered && <div className="pt-1">{action}</div>}
    </div>
  )
}

/** Fila de tabla que ocupa todo el ancho con un `EmptyState` (sustituye al "No hay…" suelto). */
export function TableEmpty({
  colSpan,
  ...props
}: { colSpan: number } & React.ComponentProps<typeof EmptyState>) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="p-0">
        <EmptyState {...props} />
      </TableCell>
    </TableRow>
  )
}
