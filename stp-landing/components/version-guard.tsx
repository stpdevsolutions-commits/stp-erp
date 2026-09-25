'use client'

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

/** ¿El error viene de una página vieja llamando a una Server Action de otra versión? */
export function esErrorDeVersion(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null
  return (
    e?.name === 'UnrecognizedActionError' ||
    /Server Action .* (was not found|not found on the server)|Failed to find Server Action/i.test(e?.message ?? '')
  )
}

export const MENSAJE_VERSION =
  'El ERP se actualizó mientras tenías esta página abierta. Recarga la página (F5) e inténtalo de nuevo; no se guardó nada.'

/**
 * Red de seguridad global: si cualquier formulario del ERP choca con una
 * versión nueva (Server Action que ya no existe) y nadie maneja el error,
 * muestra un aviso con el botón de recargar en vez de dejar la pantalla
 * "pensando" sin explicación.
 */
export function VersionGuard() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function onRejection(ev: PromiseRejectionEvent) {
      if (esErrorDeVersion(ev.reason)) {
        ev.preventDefault()
        setVisible(true)
      }
    }
    window.addEventListener('unhandledrejection', onRejection)
    return () => window.removeEventListener('unhandledrejection', onRejection)
  }, [])

  if (!visible) return null
  return (
    <div className="fixed inset-x-0 bottom-4 z-[100] flex justify-center px-4">
      <div className="bg-foreground text-background flex max-w-lg items-center gap-3 rounded-lg px-4 py-3 text-sm shadow-lg">
        <span>El ERP se actualizó mientras tenías esta página abierta.</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="bg-background text-foreground inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold"
        >
          <RefreshCw className="size-3.5" />
          Recargar
        </button>
      </div>
    </div>
  )
}
