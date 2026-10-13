import { NextRequest, NextResponse } from 'next/server'
import {
  clearSessionCookies,
  cookieBase,
  isInactive,
  refreshSession,
  REFRESH_MAX_AGE,
  writeSessionCookies,
} from '@/lib/session-refresh'

const PUBLIC_PATHS = ['/login', '/reset-password']

function jwtExp(token: string): number | null {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(b64)) as { exp?: number }
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

/**
 * Redirige a /login. Con `clear` borra además las cookies de sesión: si el token
 * seguía vigente (cierre por inactividad), dejarlas haría que /login rebotara al
 * dashboard en bucle.
 */
function toLogin(request: NextRequest, opts: { clear?: boolean; reason?: 'inactive' } = {}): NextResponse {
  const url = new URL('/login', request.url)
  if (opts.reason) url.searchParams.set('error', opts.reason)
  const response = NextResponse.redirect(url)
  if (opts.clear) clearSessionCookies(response.cookies)
  return response
}

/** El backend no responde (redeploy, red): la sesión sigue siendo válida, solo hay que reintentar. */
function unavailable(): NextResponse {
  const html =
    '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta http-equiv="refresh" content="5"><title>Servicio no disponible</title></head>' +
    '<body style="font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">' +
    '<p style="text-align:center;padding:1rem">El sistema se está actualizando o no responde.<br>' +
    'Tu sesión sigue activa; esta página se recargará sola en unos segundos.</p></body></html>'
  return new NextResponse(html, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '5', 'Cache-Control': 'no-store' },
  })
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  const isDashboard = pathname.startsWith('/dashboard') || pathname === '/'

  // x-stp-token solo lo debe poner este proxy tras una renovación: se descarta
  // la que traiga el cliente en TODAS las ramas para que nadie pueda inyectarla.
  const reqHeaders = new Headers(request.headers)
  reqHeaders.delete('x-stp-token')
  const pass = () => NextResponse.next({ request: { headers: reqHeaders } })

  const token = request.cookies.get('stp-token')?.value
  const refreshToken = request.cookies.get('stp-refresh-token')?.value
  const lastActivity = request.cookies.get('stp-last-activity')?.value

  // Si está en página pública y ya tiene token válido → al dashboard
  if (isPublic && token) {
    const exp = jwtExp(token)
    if (exp && exp * 1000 > Date.now()) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  // Si no es ruta del dashboard, pasar sin tocar
  if (!isDashboard) return pass()

  // A partir de aquí solo rutas del dashboard
  const now = Date.now()
  const exp = token ? jwtExp(token) : null
  const expired = !exp || exp * 1000 <= now

  if (expired) {
    if (!refreshToken || isInactive(lastActivity, now)) {
      return toLogin(request, { clear: true, reason: refreshToken ? 'inactive' : undefined })
    }

    // Intentar refresh silencioso (deduplicado si hay otra petición hermana
    // renovando el mismo token en este mismo instante)
    const outcome = await refreshSession(refreshToken)
    // Solo un 400/401 del refresh cierra la sesión; un 5xx o error de red
    // (p. ej. redeploy de stp-api) no debe expulsar a nadie ni borrar cookies.
    if (outcome.kind === 'unavailable') return unavailable()
    if (outcome.kind === 'invalid') return toLogin(request, { clear: true })

    // Pasar el token nuevo a los Server Components via header de request
    reqHeaders.set('x-stp-token', outcome.tokens.access_token)

    const response = NextResponse.next({ request: { headers: reqHeaders } })
    writeSessionCookies(response.cookies, outcome.tokens, now)
    return response
  }

  // Token vigente pero sin actividad más allá del límite → cierre por inactividad.
  // (Sin cookie de actividad no se asume inactividad: se crea abajo.)
  if (lastActivity && isInactive(lastActivity, now)) {
    return toLogin(request, { clear: true, reason: 'inactive' })
  }

  // Token válido — actualizar timestamp de actividad. Los prefetch de Next no
  // los inició el usuario, así que no cuentan como actividad.
  const response = pass()
  const isPrefetch =
    request.headers.has('next-router-prefetch') || request.headers.get('purpose') === 'prefetch'
  if (!isPrefetch || !lastActivity) {
    response.cookies.set('stp-last-activity', String(now), {
      ...cookieBase(),
      httpOnly: false,
      maxAge: REFRESH_MAX_AGE,
    })
  }
  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
