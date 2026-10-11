// Service worker mínimo de "STP Facturas". Hace instalable la PWA en Android y no guarda nada en
// caché a propósito: el ERP maneja sesiones y datos fiscales, y una pantalla vieja o un dato
// guardado de más es peor que pedir la red. Todas las peticiones van directo al servidor.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {
  // Sin respondWith: el navegador resuelve la petición normalmente (sin caché).
})
