import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

/** Tope del cuerpo que se reenvía: el archivo más grande permitido (10 MB) más el sobre multipart. */
const MAX_BODY_BYTES = 11 * 1024 * 1024
const BACKEND_TIMEOUT_MS = 30_000

/** Únicos segmentos de ruta que existen en /messaging/*; cualquier otro (incluido `..`) se rechaza. */
const ALLOWED_SEGMENTS = new Set([
  'contacts',
  'messages',
  'summary',
  'templates',
  'agents',
  'clients',
  'read',
  'take',
  'attachments',
  'media',
])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function validPath(path: string[]): boolean {
  return path.length <= 4 && path.every((seg) => ALLOWED_SEGMENTS.has(seg) || UUID.test(seg))
}

/** Solo las fotos/PDF/audios de un mensaje (messages/<uuid>/media) se pueden cachear en el navegador. */
function isMediaPath(path: string[]): boolean {
  return path.length === 3 && path[0] === 'messages' && UUID.test(path[1]) && path[2] === 'media'
}

function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ message }, { status })
}

/**
 * Proxy de la bandeja de WhatsApp (ERP-57) hacia /messaging/* de la API. Un único archivo para
 * todas las subrutas: reenvía método, cuerpo y token de la cookie. Las respuestas binarias
 * (fotos, PDF y notas de voz de los mensajes) pasan en flujo, sin leerlas como texto.
 */
async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  if (!validPath(path)) return jsonError(400, 'Ruta no válida')

  const store = await cookies()
  const token = store.get('stp-token')?.value
  if (!token) return new NextResponse('Unauthorized', { status: 401 })

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  if (hasBody && Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return jsonError(413, 'El archivo es demasiado grande (máximo 10 MB).')
  }

  // Las subidas de archivo van como multipart: se reenvían los bytes tal cual, con su separador (boundary).
  const incoming = req.headers.get('content-type') ?? ''
  const multipart = hasBody && incoming.startsWith('multipart/form-data')
  let body: ArrayBuffer | string | undefined
  if (hasBody) {
    body = multipart ? await req.arrayBuffer() : await req.text()
    // Sin content-length (transferencia por partes) el tamaño real solo se conoce al leerlo.
    const size = typeof body === 'string' ? body.length : body.byteLength
    if (size > MAX_BODY_BYTES) return jsonError(413, 'El archivo es demasiado grande (máximo 10 MB).')
  }

  let res: Response
  try {
    res = await fetch(`${API_URL}/messaging${path.length ? `/${path.join('/')}` : ''}${req.nextUrl.search}`, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(hasBody ? { 'Content-Type': multipart ? incoming : 'application/json' } : {}),
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    })
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
    return jsonError(timedOut ? 504 : 502, timedOut ? 'El servidor tardó demasiado en responder.' : 'No se pudo contactar al servidor.')
  }

  const type = res.headers.get('content-type') ?? 'application/json'
  const headers: Record<string, string> = { 'Content-Type': type }
  const disposition = res.headers.get('content-disposition')
  if (disposition) headers['Content-Disposition'] = disposition
  headers['X-Content-Type-Options'] = 'nosniff'
  if (res.ok && isMediaPath(path)) headers['Cache-Control'] = 'private, max-age=3600'

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
