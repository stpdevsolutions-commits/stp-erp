/** Orígenes permitidos (CORS_ORIGINS, separados por coma). Por defecto, solo el frontend de Vigía. */
export function getCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS ?? 'https://monitor.stpsoluciones.com';
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}
