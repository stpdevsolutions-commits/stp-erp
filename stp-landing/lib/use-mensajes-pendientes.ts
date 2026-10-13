'use client'

import { useEffect, useState } from 'react'

/**
 * Conversaciones de WhatsApp que esperan respuesta, para el contador del menú. Solo consulta si el
 * rol ve el módulo; un fallo (sin permiso, API caída) deja el contador en 0 sin molestar.
 */
export function useMensajesPendientes(enabled: boolean): number {
  const [waiting, setWaiting] = useState(0)

  useEffect(() => {
    if (!enabled) return
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
  }, [enabled])

  return waiting
}
