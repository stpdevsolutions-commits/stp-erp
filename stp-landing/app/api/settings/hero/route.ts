import { NextResponse } from 'next/server'
import { fetchWithSession, isSessionFailure } from '@/lib/session-fetch'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

/** Proxy de la imagen destacada de Inicio: el navegador solo habla con este origen. */
export async function GET() {
  const res = await fetchWithSession((token) =>
    fetch(`${API_URL}/settings/hero`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    }),
  )
  if (isSessionFailure(res)) return res
  if (!res.ok) return new NextResponse('Not found', { status: res.status })

  return new NextResponse(res.body, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'image/jpeg',
      // La URL lleva ?v=<versión>: cada imagen nueva es otra URL, así que puede cachearse
      'Cache-Control': 'private, max-age=86400',
    },
  })
}
