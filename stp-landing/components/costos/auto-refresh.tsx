'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Refresca los datos del servidor cada cierto tiempo mientras está montado.
 *
 * La extracción de un PDF tarda minutos y ocurre en la cola, fuera de la petición: sin
 * esto la única forma de ver el resultado sería recargar a mano. Se monta solo cuando
 * hay algo en curso, así que la página deja de sondear en cuanto no queda trabajo.
 */
export function AutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs)
    return () => clearInterval(id)
  }, [router, intervalMs])

  return null
}
