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

  cookieStore.set('stp-token', data.access_token, {
    httpOnly: true,
    secure: SECURE_COOKIES,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })

  cookieStore.set('stp-user', JSON.stringify(data.user), {
    httpOnly: false,
    secure: SECURE_COOKIES,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })

  return NextResponse.json({ user: data.user })
}
