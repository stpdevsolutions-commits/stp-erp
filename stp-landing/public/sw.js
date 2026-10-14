// Service worker mínimo de "STP Facturas". Hace instalable la PWA en Android y no guarda nada en
// caché a propósito: el ERP maneja sesiones y datos fiscales, y una pantalla vieja o un dato
// guardado de más es peor que pedir la red. Todas las peticiones van directo al servidor.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {
  // Sin respondWith: el navegador resuelve la petición normalmente (sin caché).
})

// ── Avisos push de la bandeja de WhatsApp (ERP-58) ───────────────────────────────────────────
// La carga la arma el servidor sin datos sensibles: { title, body, url, tag }. En iOS toda
// notificación push debe mostrarse (showNotification dentro de waitUntil) o el sistema revoca el permiso.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'STP ERP'
  const options = {
    body: typeof data.body === 'string' ? data.body : '',
    icon: '/pwa/icon-192.png',
    badge: '/pwa/icon-192.png',
    // Misma etiqueta = se reemplaza en vez de apilar; renotify para que vuelva a sonar/vibrar.
    tag: typeof data.tag === 'string' && data.tag ? data.tag : undefined,
    renotify: typeof data.tag === 'string' && data.tag ? true : undefined,
    data: { url: typeof data.url === 'string' ? data.url : '/dashboard/mensajes' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // Solo rutas del propio ERP: nunca se navega a un origen ajeno aunque la carga lo pidiera.
  let target = new URL('/dashboard/mensajes', self.location.origin)
  try {
    const candidate = new URL(event.notification.data && event.notification.data.url, self.location.origin)
    if (candidate.origin === self.location.origin) target = candidate
  } catch {
    // se queda con la bandeja
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((c) => new URL(c.url).origin === self.location.origin)
      if (open) {
        try {
          await open.focus()
          if ('navigate' in open) await open.navigate(target.href)
          return
        } catch {
          // si no se puede reutilizar la ventana, se abre una nueva
        }
      }
      await self.clients.openWindow(target.href)
    })(),
  )
})
