import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

/**
 * Proxy genérico para /notifications/* — un único archivo en vez de uno por
 * subruta (lista, unread-count, :id/read, read-all), ya que las cuatro solo
 * necesitan reenviar el método + adjuntar el token de la cookie.
 */
async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const store = await cookies()
  const token = store.get('stp-token')?.value
  if (!token) return new NextResponse('Unauthorized', { status: 401 })

  const url = `${API_URL}/notifications${path.length ? `/${path.join('/')}` : ''}${req.nextUrl.search}`
  const res = await fetch(url, {
    method: req.method,
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  const text = await res.text()
  return new NextResponse(text, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
  })
}

type RouteParams = { params: Promise<{ path?: string[] }> }

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { path } = await params
  return proxy(req, path ?? [])
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { path } = await params
  return proxy(req, path ?? [])
}
