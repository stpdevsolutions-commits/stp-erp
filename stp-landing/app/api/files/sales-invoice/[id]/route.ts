import { NextRequest, NextResponse } from 'next/server'
import { fetchWithSession, isSessionFailure, isUuid } from '@/lib/session-fetch'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

/** PDF de una factura emitida: se genera al vuelo en la API, con la sesión del usuario. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return new NextResponse('Factura no válida', { status: 400 })

  const res = await fetchWithSession((token) =>
    fetch(`${API_URL}/sales-invoices/${id}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  )
  if (isSessionFailure(res)) return res
  if (!res.ok) return new NextResponse('PDF no disponible', { status: res.status === 403 ? 403 : 404 })

  return new NextResponse(res.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': res.headers.get('content-disposition') ?? 'inline; filename="factura.pdf"',
      'Cache-Control': 'no-store',
    },
  })
}
