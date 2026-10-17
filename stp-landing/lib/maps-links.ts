/**
 * ERP-80: utilidades puras para la ubicación GPS de un proyecto — validación de
 * coordenadas, enlaces a apps de navegación y mensajes de error de geolocalización.
 * Sin dependencias de React ni del navegador, para poder probarlas con `node:test`.
 */

/** Latitud -90..90 y longitud -180..180, ambas números finitos. */
export function isValidCoords(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  )
}

/** Redondea a 6 decimales (≈0,1 m), que es lo que guarda la base de datos. */
export function roundCoord(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

/** "18.486058,-69.931212" — formato común a todos los enlaces y a "Copiar coordenadas". */
export function formatCoords(latitude: number, longitude: number): string {
  return `${roundCoord(latitude).toFixed(6)},${roundCoord(longitude).toFixed(6)}`
}

/**
 * Convierte lo que escribe una persona a número: admite coma decimal ("18,486") y
 * espacios. Vacío o texto no numérico → null.
 */
export function parseCoordInput(text: string | null | undefined): number | null {
  if (text == null) return null
  const t = text.trim().replace(',', '.')
  if (t === '' || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export type MapLinks = { google: string; waze: string; apple: string }

/** Enlaces de navegación hacia el punto (ruta desde donde esté la persona). */
export function mapLinks(latitude: number, longitude: number): MapLinks {
  const ll = formatCoords(latitude, longitude)
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${ll}`,
    waze: `https://waze.com/ul?ll=${ll}&navigate=yes`,
    apple: `https://maps.apple.com/?daddr=${ll}`,
  }
}

/** Códigos de GeolocationPositionError: 1 permiso denegado, 2 posición no disponible, 3 tiempo agotado. */
export function geolocationErrorMessage(code: number, secureContext = true): string {
  if (!secureContext) {
    return 'El navegador solo permite el GPS en conexiones seguras (HTTPS). Abre el ERP con https://.'
  }
  switch (code) {
    case 1:
      return 'No diste permiso de ubicación. Actívalo para este sitio en los ajustes del navegador y vuelve a intentarlo.'
    case 2:
      return 'No se pudo obtener la posición. Verifica que el GPS del teléfono esté encendido e intenta de nuevo.'
    case 3:
      return 'Se agotó el tiempo esperando el GPS. Sal a un lugar con mejor señal e intenta de nuevo.'
    default:
      return 'No se pudo obtener la ubicación.'
  }
}
