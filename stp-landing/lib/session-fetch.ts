import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { isInactive, refreshSession, writeSessionCookies } from './session-refresh'

/**
 * Para route handlers de /api/*: llama a la API con el token de la cookie y, si
 * responde 401 (o no hay token), intenta UNA renovación y reintenta una vez.
 *
 * - Sin sesión recuperable → 401 JSON ("Sesión expirada").
 * - API caída durante la renovación → 503 JSON, sin tocar las cookies.
 * - Una sesión inactiva más de INACTIVITY_MS no se renueva (igual que en proxy.ts).
 * - Cualquier otra respuesta (200, 403, 404, 5xx...) se devuelve tal cual.
 */
export async function fetchWithSession(
  call: (token: string) => Promise<Response>,
): Promise<Response> {
  const store = await cookies()
  const token = store.get('stp-token')?.value

  if (token) {
    const res = await call(token)
    if (res.status !== 401) return res
  }

  const refreshToken = store.get('stp-refresh-token')?.value
  if (!refreshToken || isInactive(store.get('stp-last-activity')?.value)) {
    return sessionExpired()
  }

  const outcome = await refreshSession(refreshToken)
  if (outcome.kind === 'unavailable') {
    return NextResponse.json(
      { message: 'El servicio no está disponible por ahora. Intenta de nuevo en unos segundos.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
  if (outcome.kind === 'invalid') return sessionExpired()

  // La marca de actividad no se toca: un handler de /api no cuenta como actividad.
  writeSessionCookies(store, outcome.tokens)
  const retry = await call(outcome.tokens.access_token)
  return retry.status === 401 ? sessionExpired() : retry
}

function sessionExpired(): NextResponse {
  return NextResponse.json(
    { message: 'Sesión expirada. Inicia sesión de nuevo.' },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  )
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Los ids que llegan por URL se interpolan en rutas de la API: solo se aceptan UUID. */
export function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value)
}

/** true si la respuesta es el 401/503 propio de fetchWithSession (hay que devolverla tal cual). */
export function isSessionFailure(res: Response): boolean {
  return res.status === 401 || res.status === 503
}
