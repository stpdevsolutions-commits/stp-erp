import { AlertTriangle } from 'lucide-react'
import type { AcuCost } from '@/lib/types'
import { fmtDOP } from './acu-labels'

/**
 * Costo directo de una unidad de la partida, calculado con los precios vigentes de hoy.
 *
 * Cuando el ACU viene `incomplete` (algún material sin precio vigente) el número NO se
 * presenta como bueno: la API valora esas líneas en 0, así que el total es un piso, no
 * el costo. Por eso se pinta en rojo, con un "≥" delante y su aviso al lado — un
 * unitario incompleto que se ve igual que uno completo termina en una cotización.
 *
 * Server Component: no necesita interactividad.
 */
export function CostoUnitario({
  cost,
  unit,
  size = 'sm',
}: {
  cost?: AcuCost
  unit?: string
  size?: 'sm' | 'lg'
}) {
  if (!cost) return <span className="text-muted-foreground text-sm">—</span>

  if (cost.lines.length === 0) {
    return <span className="text-muted-foreground text-sm">Sin receta</span>
  }

  const faltan = cost.missingMaterialIds.length
  const amount = size === 'lg' ? 'text-2xl font-bold' : 'text-sm font-medium'

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span
        className={`font-mono ${amount} ${cost.incomplete ? 'text-destructive' : ''}`}
        title={
          cost.incomplete
            ? 'Faltan precios: el total mostrado es un mínimo, no el costo real'
            : undefined
        }
      >
        {cost.incomplete && '≥ '}
        {fmtDOP(cost.directCost)}
        {unit && <span className="text-muted-foreground font-sans text-xs">/{unit}</span>}
      </span>

      {cost.incomplete && (
        <span className="text-destructive inline-flex items-center gap-1 text-[11px] font-medium">
          <AlertTriangle className="size-3" />
          Incompleto
          {faltan > 0 && `: ${faltan} sin precio`}
        </span>
      )}
    </span>
  )
}
