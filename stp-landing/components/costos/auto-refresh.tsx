'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Refresca los datos del servidor cada cierto tiempo mientras está montado.
 *
 * La extracción de un PDF tarda minutos y ocurre en la cola, fuera de la petición: sin
 * esto la única forma de ver el resultado sería recargar a mano. Se monta solo cuando
 * hay algo en curso, así que la página deja de sondear en cuanto no queda trabajo.
 *
 * Con la pestaña oculta no se sondea (cada refresh es un render completo en el servidor);
 * al volver a verla se refresca de inmediato.
 */
export function AutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, intervalMs)
    const onVisible = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [router, intervalMs])

  return null
}
