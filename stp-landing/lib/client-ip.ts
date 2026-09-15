/**
 * IP real del visitante, para reenviarla al backend en los endpoints públicos
 * de auth (login, forgot/reset-password).
 *
 * Sin esto, el backend ve siempre la IP del contenedor de stp-landing en vez
 * de la del usuario: el fetch de Next hacia stp-api es una petición nueva,
 * no un passthrough, así que no arrastra la cadena de proxy original. Caddy
 * sí pone `X-Forwarded-For` real al llegar aquí — solo hay que reenviarlo.
 */
export function forwardedForHeader(request: Request): Record<string, string> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return ip ? { 'X-Forwarded-For': ip } : {}
}
