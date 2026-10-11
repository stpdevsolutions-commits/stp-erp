import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Identificador de cada compilación (lo pone el Dockerfile). Con él, una
  // pestaña abierta desde antes de un despliegue se recarga sola al navegar
  // en vez de llamar a Server Actions que ya no existen ("Failed to find
  // Server Action" y un botón que se queda pensando).
  deploymentId: process.env.DEPLOYMENT_VERSION,
  experimental: {
    // Una foto de celular pesa varios MB y por defecto una Server Action solo acepta 1 MB:
    // sin esto no se podría escanear ni adjuntar la foto de una factura. 12 MB deja margen
    // sobre el tope de 10 MB por archivo del API.
    serverActions: { bodySizeLimit: '12mb' },
  },
};

export default nextConfig;
