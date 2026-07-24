import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function GET(req: NextRequest) {
  const store = await cookies()
  const token = store.get('stp-token')?.value
  if (!token) return new NextResponse('Unauthorized', { status: 401 })

  const params = req.nextUrl.searchParams.toString()
  const res = await fetch(`${API_URL}/quotes/export/xlsx${params ? `?${params}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return new NextResponse('Error al exportar', { status: res.status })

  const buffer = await res.arrayBuffer()
  const disposition =
    res.headers.get('content-disposition') ?? 'attachment; filename="cotizaciones.xlsx"'

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': XLSX_TYPE,
      'Content-Disposition': disposition,
      'Cache-Control': 'no-store',
    },
  })
}
