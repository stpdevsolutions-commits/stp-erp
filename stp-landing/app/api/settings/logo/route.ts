import { NextResponse } from 'next/server'
import { fetchWithSession, isSessionFailure } from '@/lib/session-fetch'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

/**
 * Antes no existía este archivo: `<img src="/api/settings/logo">`
 * (components/settings/logo-upload.tsx) siempre daba 404 de Next.js, incluso
 * con un logo ya subido — la subida (Server Action, con authFetch) sí
 * funcionaba, pero nunca se podía VER la vista previa en Configuración.
 */
export async function GET() {
  const res = await fetchWithSession((token) =>
    fetch(`${API_URL}/settings/logo`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    }),
  )
  if (isSessionFailure(res)) return res
  if (!res.ok) return new NextResponse('Not found', { status: res.status })

  const contentType = res.headers.get('content-type') ?? 'image/png'
  return new NextResponse(res.body, {
    headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=300' },
  })
}
