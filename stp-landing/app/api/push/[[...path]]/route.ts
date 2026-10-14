import { NextRequest, NextResponse } from 'next/server'
import { fetchWithSession } from '@/lib/session-fetch'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const BACKEND_TIMEOUT_MS = 15_000
const MAX_BODY_BYTES = 8 * 1024

/** Únicas rutas de /push/*: la clave pública y el alta/baja de la suscripción de este dispositivo. */
const ALLOWED = new Set(['public-key', 'subscribe'])

function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ message }, { status })
}

/** Proxy de los avisos push (ERP-58) hacia /push/* de la API, con el token de la cookie de sesión. */
async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  if (path.length !== 1 || !ALLOWED.has(path[0])) return jsonError(400, 'Ruta no válida')

  const hasBody = req.method !== 'GET'
  const body = hasBody ? await req.text() : undefined
  if (body !== undefined && body.length > MAX_BODY_BYTES) return jsonError(413, 'Solicitud demasiado grande.')

  let res: Response
  try {
    res = await fetchWithSession((token) =>
      fetch(`${API_URL}/push/${path[0]}`, {
        method: req.method,
        headers: {
          Authorization: `Bearer ${token}`,
          // El User-Agent del navegador se reenvía para que la lista de dispositivos sea legible.
          'User-Agent': req.headers.get('user-agent') ?? '',
          ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        },
        body,
        cache: 'no-store',
        signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
      }),
    )
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
    return jsonError(timedOut ? 504 : 502, timedOut ? 'El servidor tardó demasiado en responder.' : 'No se pudo contactar al servidor.')
  }

  return new NextResponse(res.status === 204 ? null : res.body, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json', 'X-Content-Type-Options': 'nosniff' },
  })
}

type RouteParams = { params: Promise<{ path?: string[] }> }

export async function GET(req: NextRequest, { params }: RouteParams) {
  return proxy(req, (await params).path ?? [])
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  return proxy(req, (await params).path ?? [])
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  return proxy(req, (await params).path ?? [])
}
