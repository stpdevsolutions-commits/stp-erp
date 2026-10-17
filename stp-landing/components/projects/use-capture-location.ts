'use client'

import { useState } from 'react'
import { toast } from '@/lib/toast'
import { geolocationErrorMessage, roundCoord } from '@/lib/maps-links'

/**
 * ERP-80: pide al navegador la posición actual (GPS del teléfono, alta precisión).
 * `capture()` devuelve las coordenadas redondeadas a 6 decimales, o null si falló
 * (el aviso en español ya se mostró). Requiere HTTPS salvo en localhost.
 */
export function useCaptureLocation() {
  const [capturing, setCapturing] = useState(false)

  async function capture(): Promise<{ latitude: number; longitude: number; accuracy: number } | null> {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      toast.error('Este dispositivo o navegador no permite obtener la ubicación.')
      return null
    }
    if (!window.isSecureContext) {
      toast.error(geolocationErrorMessage(0, false))
      return null
    }
    setCapturing(true)
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        }),
      )
      return {
        latitude: roundCoord(pos.coords.latitude),
        longitude: roundCoord(pos.coords.longitude),
        accuracy: pos.coords.accuracy,
      }
    } catch (e) {
      const code = (e as GeolocationPositionError | undefined)?.code ?? 0
      toast.error(geolocationErrorMessage(code))
      return null
    } finally {
      setCapturing(false)
    }
  }

  return { capture, capturing }
}
