'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">Algo salió mal</h2>
        <p className="text-muted-foreground text-sm max-w-md">
          Ocurrió un error al cargar esta sección. Puedes intentarlo de nuevo.
        </p>
        {error.digest ? (
          <p className="text-muted-foreground/70 text-xs">Código: {error.digest}</p>
        ) : null}
      </div>
      <Button onClick={() => reset()}>Reintentar</Button>
    </div>
  )
}
