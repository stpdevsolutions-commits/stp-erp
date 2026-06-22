import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://stp-api:3001'
const INACTIVITY_MS = 30 * 60 * 1000 // 30 minutos
const SECURE = process.env.COOKIE_SECURE === 'true'

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

function toLogin(request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL('/login', request.url))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  const isDashboard = pathname.startsWith('/dashboard') || pathname === '/'

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
  if (!isDashboard) return NextResponse.next()

  // A partir de aquí solo rutas del dashboard
  const now = Date.now()
  const exp = token ? jwtExp(token) : null
  const expired = !exp || exp * 1000 <= now

  if (expired) {
    const lastTs = lastActivity ? parseInt(lastActivity, 10) : 0
    if (!refreshToken || now - lastTs > INACTIVITY_MS) {
      return toLogin(request)
    }

    // Intentar refresh silencioso
    try {
      const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: 'no-store',
      })

      if (!refreshRes.ok) return toLogin(request)

      const data = (await refreshRes.json()) as {
        access_token: string
        refresh_token: string
      }

      // Pasar el token nuevo a los Server Components via header de request
      const reqHeaders = new Headers(request.headers)
      reqHeaders.set('x-stp-token', data.access_token)

      const response = NextResponse.next({ request: { headers: reqHeaders } })
      const base = { httpOnly: true, secure: SECURE, sameSite: 'lax' as const, path: '/' }

      response.cookies.set('stp-token', data.access_token, { ...base, maxAge: 60 * 60 * 24 * 7 })
      response.cookies.set('stp-refresh-token', data.refresh_token, { ...base, maxAge: 60 * 60 * 24 * 30 })
      response.cookies.set('stp-last-activity', String(now), { ...base, httpOnly: false, maxAge: 60 * 60 * 24 * 30 })

      return response
    } catch {
      return toLogin(request)
    }
  }

  // Token válido — actualizar timestamp de actividad
  const response = NextResponse.next()
  response.cookies.set('stp-last-activity', String(now), {
    httpOnly: false,
    secure: SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
