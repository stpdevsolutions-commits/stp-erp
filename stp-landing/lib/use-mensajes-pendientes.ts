'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

/** Evento con el que la bandeja avisa al menú de su conteo de "esperan respuesta" (así el menú no consulta aparte). */
export const MENSAJES_WAITING_EVENT = 'stp:mensajes-waiting'

/**
 * Conversaciones de WhatsApp que esperan respuesta, para el contador del menú. Solo consulta si el
 * rol ve el módulo; un fallo (sin permiso, API caída) deja el contador en 0 sin molestar. Dentro de la
 * pantalla de mensajes no consulta: la bandeja ya hace su propio polling y le pasa el conteo.
 */
export function useMensajesPendientes(enabled: boolean): number {
  const [waiting, setWaiting] = useState(0)
  const inMensajes = (usePathname() ?? '').startsWith('/dashboard/mensajes')

  useEffect(() => {
    if (!enabled) return
    if (inMensajes) {
      const onWaiting = (e: Event) => {
        const n = (e as CustomEvent<number>).detail
        if (typeof n === 'number') setWaiting(n)
      }
      window.addEventListener(MENSAJES_WAITING_EVENT, onWaiting)
      return () => window.removeEventListener(MENSAJES_WAITING_EVENT, onWaiting)
    }
    let cancelled = false
    const load = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch('/api/messaging/summary', { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as { waiting?: number }
        if (!cancelled) setWaiting(data.waiting ?? 0)
      } catch {
        /* el siguiente ciclo reintenta */
      }
    }
    void load()
    const id = setInterval(load, 30_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [enabled, inMensajes])

  return waiting
}
