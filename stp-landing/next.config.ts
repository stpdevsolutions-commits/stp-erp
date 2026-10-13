import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Identificador de cada compilación (lo pone el Dockerfile). Con él, una
  // pestaña abierta desde antes de un despliegue se recarga sola al navegar
  // en vez de llamar a Server Actions que ya no existen ("Failed to find
  // Server Action" y un botón que se queda pensando).
  deploymentId: process.env.DEPLOYMENT_VERSION,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          // Nada del ERP se incrusta en iframes (los PDF se abren en pestaña nueva).
          { key: 'X-Frame-Options', value: 'DENY' },
          // CSP deliberadamente parcial: solo frame-ancestors, base-uri y form-action.
          // NO se restringe script-src todavía: el script de tema y el propio Next
          // inyectan scripts inline (hidratación/RSC payload) y una política con
          // script-src exigiría nonces por petición vía proxy.ts, lo que además
          // vuelve dinámicas todas las páginas. Pendiente como mejora aparte.
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
          // Cámara solo en el propio origen (lector QR de facturas); el resto, apagado.
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()' },
        ],
      },
    ]
  },
  experimental: {
    // Una foto de celular pesa varios MB y por defecto una Server Action solo acepta 1 MB:
    // sin esto no se podría escanear ni adjuntar la foto de una factura. 12 MB deja margen
    // sobre el tope de 10 MB por archivo del API.
    serverActions: { bodySizeLimit: '12mb' },
  },
};

export default nextConfig;
