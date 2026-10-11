import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

/** Foto o PDF de una factura fiscal: pasa la sesión al API y devuelve el archivo. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const store = await cookies()
  const token = store.get('stp-token')?.value
  if (!token) return new NextResponse('Unauthorized', { status: 401 })

  const res = await fetch(`${API_URL}/fiscal-invoices/${id}/photo`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return new NextResponse('Foto no disponible', { status: 404 })

  return new NextResponse(res.body, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition': res.headers.get('content-disposition') ?? 'inline',
      'Cache-Control': 'no-store',
    },
  })
}
