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
    }).catch(() => {})
  }

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

export async function GET(request: Request) {
  await clearSession()
  return NextResponse.redirect(new URL('/login', request.url))
}

export async function POST() {
  await clearSession()
  return NextResponse.json({ ok: true })
}
