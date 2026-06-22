import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const SECURE_COOKIES = process.env.COOKIE_SECURE === 'true'

export async function POST(request: Request) {
  const body = await request.json()

  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Error de autenticación' }))
    return NextResponse.json(
      { message: error.message ?? 'Credenciales inválidas' },
      { status: res.status },
    )
  }

  const data = await res.json()
  const cookieStore = await cookies()

  const base = { secure: SECURE_COOKIES, sameSite: 'lax' as const, path: '/' }

  cookieStore.set('stp-token', data.access_token, {
    ...base,
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
  })
  cookieStore.set('stp-refresh-token', data.refresh_token, {
    ...base,
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
  })
  cookieStore.set('stp-user', JSON.stringify(data.user), {
    ...base,
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 7,
  })
  cookieStore.set('stp-last-activity', String(Date.now()), {
    ...base,
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 30,
  })

  return NextResponse.json({ user: data.user })
}
