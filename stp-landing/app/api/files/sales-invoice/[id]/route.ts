import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

/** PDF de una factura emitida: se genera al vuelo en la API, con la sesión del usuario. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const store = await cookies()
  const token = store.get('stp-token')?.value
  if (!token) return new NextResponse('Unauthorized', { status: 401 })

  const res = await fetch(`${API_URL}/sales-invoices/${id}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return new NextResponse('PDF no disponible', { status: res.status === 403 ? 403 : 404 })

  return new NextResponse(res.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': res.headers.get('content-disposition') ?? 'inline; filename="factura.pdf"',
      'Cache-Control': 'no-store',
    },
  })
}
