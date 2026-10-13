import { NextRequest, NextResponse } from 'next/server'
import { fetchWithSession, isSessionFailure, isUuid } from '@/lib/session-fetch'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

/** Foto o PDF de una factura fiscal: pasa la sesión al API y devuelve el archivo. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!isUuid(id)) return new NextResponse('Factura no válida', { status: 400 })

  const res = await fetchWithSession((token) =>
    fetch(`${API_URL}/fiscal-invoices/${id}/photo`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  )
  if (isSessionFailure(res)) return res
  if (!res.ok) return new NextResponse('Foto no disponible', { status: 404 })

  return new NextResponse(res.body, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition': res.headers.get('content-disposition') ?? 'inline',
      'Cache-Control': 'no-store',
    },
  })
}
