import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const PASOS = [
  { titulo: 'Subir el PDF', texto: 'La cotización del proveedor, tal como te la mandó.' },
  { titulo: 'La IA lo lee', texto: 'Saca cada renglón con su precio. Tarda 1–2 minutos.' },
  {
    titulo: 'Asignar materiales',
    texto: 'Cada renglón se liga a un material del catálogo: aceptas la sugerencia, lo buscas o lo creas.',
  },
  { titulo: 'Aprobar', texto: 'Los renglones listos entran como precio vigente del material.' },
]

/**
 * Los 4 pasos de la importación, con el paso actual resaltado. Sin `actual`
 * sirve de explicación general (lista de importaciones).
 */
export function ImportarPasos({ actual }: { actual?: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <ol className="grid gap-2 sm:grid-cols-4">
      {PASOS.map((p, i) => {
        const n = i + 1
        const hecho = actual !== undefined && n < actual
        const activo = actual === n
        return (
          <li
            key={p.titulo}
            className={cn(
              'rounded-lg border p-3',
              activo && 'border-primary bg-primary/5',
              hecho && 'opacity-60',
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                  (activo || hecho) && 'border-primary bg-primary text-primary-foreground',
                )}
              >
                {hecho ? <Check className="size-3.5" /> : n}
              </span>
              <span className="text-sm font-semibold">{p.titulo}</span>
            </div>
            <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">{p.texto}</p>
          </li>
        )
      })}
    </ol>
  )
}
