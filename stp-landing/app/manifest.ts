import type { MetadataRoute } from 'next'

/**
 * PWA "STP Facturas": se instala desde el navegador (iPhone: Compartir → "Añadir a pantalla de
 * inicio"; Android: menú → "Instalar app") y abre directo en la pantalla de escanear. Sirve el
 * mismo ERP, así que el inicio de sesión y los permisos son los de siempre.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'STP Facturas',
    short_name: 'Facturas',
    description: 'Escanea facturas y regístralas en el ERP de STP, con o sin proyecto.',
    start_url: '/dashboard/escanear',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#0D3773',
    lang: 'es',
    icons: [
      { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/pwa/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
