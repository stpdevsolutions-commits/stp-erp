import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

/** Proxy de la imagen destacada de Inicio: el navegador solo habla con este origen. */
export async function GET() {
  const store = await cookies()
  const token = store.get('stp-token')?.value
  if (!token) return new NextResponse('Unauthorized', { status: 401 })

  const res = await fetch(`${API_URL}/settings/hero`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (!res.ok) return new NextResponse('Not found', { status: res.status })

  return new NextResponse(res.body, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'image/jpeg',
      // La URL lleva ?v=<versión>: cada imagen nueva es otra URL, así que puede cachearse
      'Cache-Control': 'private, max-age=86400',
    },
  })
}
