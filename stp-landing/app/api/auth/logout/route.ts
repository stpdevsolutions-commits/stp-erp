import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://stp-api:3001'

async function clearSession() {
  const cookieStore = await cookies()
  const refreshToken = cookieStore.get('stp-refresh-token')?.value

  if (refreshToken) {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {})
  }

  // 'stp-user' ya no la escribe este frontend, pero el login con Google del API
  // todavía la emite: se sigue borrando aquí para que no sobreviva al logout.
  const names = ['stp-token', 'stp-refresh-token', 'stp-user', 'stp-last-activity']
  const domain = process.env.COOKIE_DOMAIN

  for (const name of names) {
    // Borra la cookie host-only
    cookieStore.delete(name)
    // Y también la cookie con dominio (p.ej. la que setea el login con Google
    // con Domain=.stpsoluciones.com), que de otro modo sobrevive al logout.
    if (domain) {
      cookieStore.set(name, '', {
        maxAge: 0,
        path: '/',
        domain,
        secure: true,
        sameSite: 'lax',
      })
    }
  }
}

/**
 * GET cambia estado (cierra sesión), así que solo se atiende si es una navegación
 * propia: pageError() y el layout del dashboard redirigen aquí tras un 401. Una
 * petición cross-site (imagen, enlace en otra web) recibe un redirect a /login
 * SIN cerrar la sesión. Si el navegador no envía Sec-Fetch-Site (muy antiguo) se
 * permite, para no dejar atascado el redirect de sesión expirada.
 * El botón "Cerrar sesión" usa POST.
 */
export async function GET(request: Request) {
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  await clearSession()
  return NextResponse.redirect(new URL('/login', request.url))
}

export async function POST(request: Request) {
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') {
    return NextResponse.json({ message: 'Solicitud no permitida' }, { status: 403 })
  }
  await clearSession()
  return NextResponse.json({ ok: true })
}
