import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { forwardedForHeader } from '@/lib/client-ip'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const SECURE_COOKIES = process.env.COOKIE_SECURE === 'true'

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Solicitud inválida' }, { status: 400 })
  }

  let res: Response
  try {
    res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...forwardedForHeader(request) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    return NextResponse.json(
      { message: 'El servicio no está disponible por ahora. Intenta de nuevo en unos segundos.' },
      { status: 503 },
    )
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Error de autenticación' }))
    return NextResponse.json(
      { message: error.message ?? 'Credenciales inválidas' },
      { status: res.status },
    )
  }

  let data: { access_token?: string; refresh_token?: string; user?: unknown }
  try {
    data = await res.json()
  } catch {
    return NextResponse.json({ message: 'Respuesta inválida del servidor' }, { status: 502 })
  }
  if (!data.access_token || !data.refresh_token) {
    return NextResponse.json({ message: 'Respuesta inválida del servidor' }, { status: 502 })
  }
  const cookieStore = await cookies()

  const base = {
    secure: SECURE_COOKIES,
    sameSite: 'lax' as const,
    path: '/',
    domain: process.env.COOKIE_DOMAIN || undefined,
  }

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
  cookieStore.set('stp-last-activity', String(Date.now()), {
    ...base,
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 30,
  })

  return NextResponse.json({ user: data.user })
}
