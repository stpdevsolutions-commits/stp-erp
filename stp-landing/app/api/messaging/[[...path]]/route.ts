import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

/**
 * Proxy de la bandeja de WhatsApp (ERP-57) hacia /messaging/* de la API. Un único archivo para
 * todas las subrutas: reenvía método, cuerpo y token de la cookie. Las respuestas binarias
 * (fotos, PDF y notas de voz de los mensajes) pasan en flujo, sin leerlas como texto.
 */
async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const store = await cookies()
  const token = store.get('stp-token')?.value
  if (!token) return new NextResponse('Unauthorized', { status: 401 })

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  // Las subidas de archivo van como multipart: se reenvían los bytes tal cual, con su separador (boundary).
  const incoming = req.headers.get('content-type') ?? ''
  const multipart = hasBody && incoming.startsWith('multipart/form-data')
  const res = await fetch(`${API_URL}/messaging${path.length ? `/${path.join('/')}` : ''}${req.nextUrl.search}`, {
    method: req.method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(hasBody ? { 'Content-Type': multipart ? incoming : 'application/json' } : {}),
    },
    body: hasBody ? (multipart ? await req.arrayBuffer() : await req.text()) : undefined,
    cache: 'no-store',
  })

  const type = res.headers.get('content-type') ?? 'application/json'
  const headers: Record<string, string> = { 'Content-Type': type }
  const disposition = res.headers.get('content-disposition')
  if (disposition) headers['Content-Disposition'] = disposition
  headers['X-Content-Type-Options'] = 'nosniff'
  if (path[0] === 'messages') headers['Cache-Control'] = 'private, max-age=3600'

  return new NextResponse(res.status === 204 ? null : res.body, { status: res.status, headers })
}

type RouteParams = { params: Promise<{ path?: string[] }> }

export async function GET(req: NextRequest, { params }: RouteParams) {
  return proxy(req, (await params).path ?? [])
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  return proxy(req, (await params).path ?? [])
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  return proxy(req, (await params).path ?? [])
}
