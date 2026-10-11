import * as React from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * Indicador compacto de una lista (Pendientes, En curso, …): etiqueta pequeña y cifra.
 * Es la pieza única para los contadores de cabecera de los módulos; en celular se aprieta
 * para que cinco indicadores quepan en dos filas en vez de ocupar la pantalla entera.
 */
export function StatCard({
  label,
  children,
  className,
}: {
  label: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card size="sm" className={cn('gap-1 sm:[--card-spacing:--spacing(4)]', className)}>
      <div className="space-y-1 px-(--card-spacing)">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        <div className="tabular-nums [&>div]:text-lg [&>div]:font-bold sm:[&>div]:text-2xl">{children}</div>
      </div>
    </Card>
  )
}
