const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://stp-api:3001'

export async function POST(request: Request) {
  const body = await request.json()
  const res = await fetch(`${API_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string }
    return Response.json({ message: err.message ?? 'Error al procesar la solicitud' }, { status: res.status })
  }
  return Response.json({ ok: true })
}
