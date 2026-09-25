'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  deletePriceImport,
  rematchPriceImport,
  retryPriceImport,
} from '@/lib/actions/price-imports'

/** Acciones sobre el lote entero: volver a leer, volver a emparejar, eliminar. */
export function LoteAcciones({
  importId,
  puedeReintentar,
  sinMaterial,
}: {
  importId: string
  /** Falló, o se leyó y no salió ningún renglón. */
  puedeReintentar: boolean
  /** Renglones pendientes que todavía no tienen material. */
  sinMaterial: number
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function run(kind: string, fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setBusy(kind)
    setMsg(null)
    const r = await fn()
    setBusy(null)
    setMsg(r.ok ? ok : (r.error ?? 'No se pudo completar'))
    startTransition(() => router.refresh())
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {puedeReintentar && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={() => run('retry', () => retryPriceImport(importId), 'Leyendo el documento otra vez…')}
        >
          <RefreshCw className="size-4" />
          Volver a leer con IA
        </Button>
      )}
      {sinMaterial > 0 && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={async () => {
            setBusy('rematch')
            setMsg(null)
            const r = await rematchPriceImport(importId)
            setBusy(null)
            setMsg(
              r.ok
                ? r.assigned
                  ? `${r.assigned} renglón(es) asignado(s) automáticamente.`
                  : 'No apareció ninguna coincidencia segura nueva: revisa las sugerencias.'
                : (r.error ?? 'No se pudo buscar'),
            )
            startTransition(() => router.refresh())
          }}
        >
          <Search className="size-4" />
          Buscar coincidencias de nuevo
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        disabled={busy !== null}
        onClick={async () => {
          if (!window.confirm('¿Eliminar esta importación y su PDF? Los precios ya aprobados se quedan.')) return
          setBusy('delete')
          const r = await deletePriceImport(importId)
          setBusy(null)
          if (r.ok) router.push('/dashboard/costos/importar')
          else setMsg(r.error ?? 'No se pudo eliminar')
        }}
      >
        <Trash2 className="size-4" />
        Eliminar
      </Button>
      {msg && <p className="text-muted-foreground w-full text-sm">{msg}</p>}
    </div>
  )
}
