'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Aviso de carga parcial: el servidor falló al traer algunas secciones de la página (no es
 * "sin datos"). Lista cuáles y ofrece reintentar (re-renderiza la página en el servidor sin
 * perder la navegación). Lo que sí cargó se sigue mostrando debajo. No renderiza nada si
 * `failed` está vacío. El 401 lo gestiona el layout del dashboard / `loadSafe`.
 */
export function LoadErrorBanner({
  failed,
  className,
}: {
  failed: string[]
  className?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  if (failed.length === 0) return null

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm',
        className,
      )}
    >
      <AlertTriangle className="size-4 shrink-0 text-destructive" />
      <p className="min-w-0 flex-1 text-destructive">
        <span className="font-medium">No se pudo cargar: {failed.join(', ')}.</span>{' '}
        <span className="text-destructive/80">
          Lo que ves en esas secciones puede estar incompleto; no significa que no haya datos.
        </span>
      </p>
      <Button
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        <RefreshCw className={cn('size-3.5', pending && 'animate-spin')} />
        {pending ? 'Reintentando…' : 'Reintentar'}
      </Button>
    </div>
  )
}
