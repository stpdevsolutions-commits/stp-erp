import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Identificador de cada compilación (lo pone el Dockerfile). Con él, una
  // pestaña abierta desde antes de un despliegue se recarga sola al navegar
  // en vez de llamar a Server Actions que ya no existen ("Failed to find
  // Server Action" y un botón que se queda pensando).
  deploymentId: process.env.DEPLOYMENT_VERSION,
};

export default nextConfig;
