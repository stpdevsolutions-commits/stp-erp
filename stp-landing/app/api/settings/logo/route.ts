import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

/**
 * Antes no existía este archivo: `<img src="/api/settings/logo">`
 * (components/settings/logo-upload.tsx) siempre daba 404 de Next.js, incluso
 * con un logo ya subido — la subida (Server Action, con authFetch) sí
 * funcionaba, pero nunca se podía VER la vista previa en Configuración.
 */
export async function GET() {
  const store = await cookies()
  const token = store.get('stp-token')?.value
  if (!token) return new NextResponse('Unauthorized', { status: 401 })

  const res = await fetch(`${API_URL}/settings/logo`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })

  if (!res.ok) return new NextResponse('Not found', { status: res.status })

  const contentType = res.headers.get('content-type') ?? 'image/png'
  return new NextResponse(res.body, {
    headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=300' },
  })
}
