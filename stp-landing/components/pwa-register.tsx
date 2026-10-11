'use client'

import { useEffect } from 'react'

/** Registra el service worker que hace instalable la PWA (ver public/sw.js). No pinta nada. */
export function PwaRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Sin service worker la app sigue funcionando; solo no se ofrece "Instalar" en algunos navegadores.
      })
    }
  }, [])
  return null
}
