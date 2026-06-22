import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export async function GET(req: NextRequest) {
  const store = await cookies()
  const token = store.get('stp-token')?.value
  if (!token) return new NextResponse('Unauthorized', { status: 401 })

  const params = req.nextUrl.searchParams.toString()
  const res = await fetch(`${API_URL}/expenses/export/csv${params ? `?${params}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return new NextResponse('Error al exportar', { status: res.status })

  const csv = await res.text()
  const disposition = res.headers.get('content-disposition') ?? 'attachment; filename="gastos.csv"'

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': disposition,
      'Cache-Control': 'no-store',
    },
  })
}
