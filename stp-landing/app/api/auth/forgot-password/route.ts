import { forwardedForHeader } from '@/lib/client-ip'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://stp-api:3001'

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ message: 'Solicitud inválida' }, { status: 400 })
  }

  let res: Response
  try {
    res = await fetch(`${API_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...forwardedForHeader(request) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    return Response.json({ message: 'El servicio no está disponible por ahora. Intenta de nuevo.' }, { status: 503 })
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string }
    return Response.json({ message: err.message ?? 'Error al procesar la solicitud' }, { status: res.status })
  }
  return Response.json({ ok: true })
}
