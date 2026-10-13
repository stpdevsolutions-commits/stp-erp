/**
 * Renovación de sesión compartida por proxy.ts y por los handlers de /api/*.
 *
 * proxy.ts NO cubre /api (el matcher lo excluye a propósito: el polling no debe
 * contar como actividad), pero el JWT dura 1 h y la cookie 7 días. Por eso los
 * handlers que reenvían el token a la API, al recibir un 401, intentan UNA
 * renovación con el refresh token de la cookie y reintentan una vez
 * (ver fetchWithSession en lib/session-fetch.ts).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://stp-api:3001'
const SECURE = process.env.COOKIE_SECURE === 'true'

export const INACTIVITY_MS = 30 * 60 * 1000 // 30 minutos

export type RefreshTokens = { access_token: string; refresh_token: string }

/**
 * - ok: renovado.
 * - invalid: la API rechazó el refresh token (400/401) → hay que cerrar sesión.
 * - unavailable: 5xx o error de red (p. ej. redeploy de stp-api) → NO es motivo
 *   para cerrar sesión; el refresh token sigue siendo válido.
 */
export type RefreshOutcome =
  | { kind: 'ok'; tokens: RefreshTokens }
  | { kind: 'invalid' }
  | { kind: 'unavailable' }

/**
 * Deduplica renovaciones concurrentes del MISMO refresh token.
 *
 * El token es de un solo uso: el backend lo revoca en cuanto una renovación
 * tiene éxito. Sin esto, dos peticiones casi simultáneas con el token ya
 * vencido (varias pestañas, prefetch de Next) leen la misma cookie todavía
 * sin rotar, y la que llega segunda al backend recibe "token inválido" →
 * cierre de sesión espurio de un usuario que sí tenía sesión válida.
 * Como stp-landing corre en un solo contenedor, un mapa en memoria basta.
 *
 * Vive en globalThis porque proxy.ts y los route handlers pueden compilarse en
 * bundles distintos, y cada bundle tendría su propio mapa de módulo.
 */
const globalStore = globalThis as unknown as {
  __stpRefreshInFlight?: Map<string, Promise<RefreshOutcome>>
}
const refreshInFlight = (globalStore.__stpRefreshInFlight ??= new Map())

export async function refreshSession(refreshToken: string): Promise<RefreshOutcome> {
  const inFlight = refreshInFlight.get(refreshToken)
  if (inFlight) return inFlight

  const promise = (async (): Promise<RefreshOutcome> => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      })
      if (res.ok) {
        const data = (await res.json()) as Partial<RefreshTokens>
        if (data.access_token && data.refresh_token) {
          return { kind: 'ok', tokens: { access_token: data.access_token, refresh_token: data.refresh_token } }
        }
        return { kind: 'unavailable' }
      }
      // Solo un rechazo explícito del token cierra la sesión.
      if (res.status === 400 || res.status === 401) return { kind: 'invalid' }
      return { kind: 'unavailable' }
    } catch {
      return { kind: 'unavailable' }
    }
  })()

  refreshInFlight.set(refreshToken, promise)
  // Se limpia unos segundos después de resolver, no de inmediato: una
  // petición hermana que llegue justo después sigue viendo el resultado ya
  // resuelto en vez de disparar su propia llamada (redundante) al backend.
  promise.finally(() => {
    setTimeout(() => refreshInFlight.delete(refreshToken), 5000)
  })
  return promise
}

/** true si hay marca de actividad y es más antigua que el límite. */
export function isInactive(lastActivity: string | undefined, now = Date.now()): boolean {
  const ts = lastActivity ? parseInt(lastActivity, 10) : 0
  return now - (Number.isFinite(ts) ? ts : 0) > INACTIVITY_MS
}

export const SESSION_COOKIE_NAMES = ['stp-token', 'stp-refresh-token', 'stp-user', 'stp-last-activity']

export function cookieBase() {
  return {
    secure: SECURE,
    sameSite: 'lax' as const,
    path: '/',
    domain: process.env.COOKIE_DOMAIN || undefined,
  }
}

/** Opciones de las cookies de sesión (mismas que app/api/auth/login). */
export const TOKEN_MAX_AGE = 60 * 60 * 24 * 7
export const REFRESH_MAX_AGE = 60 * 60 * 24 * 30

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CookieWriter = { set: (...args: any[]) => unknown }

/** Guarda access/refresh token (y opcionalmente la marca de actividad). */
export function writeSessionCookies(
  jar: CookieWriter,
  tokens: RefreshTokens,
  activityTs?: number,
): void {
  const base = cookieBase()
  jar.set('stp-token', tokens.access_token, { ...base, httpOnly: true, maxAge: TOKEN_MAX_AGE })
  jar.set('stp-refresh-token', tokens.refresh_token, { ...base, httpOnly: true, maxAge: REFRESH_MAX_AGE })
  if (activityTs !== undefined) {
    jar.set('stp-last-activity', String(activityTs), { ...base, httpOnly: false, maxAge: REFRESH_MAX_AGE })
  }
}

/** Borra las cookies de sesión (host-only y, si hay, la de dominio compartido). */
export function clearSessionCookies(jar: CookieWriter): void {
  const domain = process.env.COOKIE_DOMAIN
  for (const name of SESSION_COOKIE_NAMES) {
    jar.set(name, '', { path: '/', maxAge: 0, secure: SECURE, sameSite: 'lax' })
    if (domain) jar.set(name, '', { path: '/', maxAge: 0, secure: SECURE, sameSite: 'lax', domain })
  }
}
