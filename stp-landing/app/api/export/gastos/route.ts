import { NextRequest, NextResponse } from 'next/server'
import { fetchWithSession, isSessionFailure } from '@/lib/session-fetch'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams.toString()
  const res = await fetchWithSession((token) =>
    fetch(`${API_URL}/expenses/export/xlsx${params ? `?${params}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  )
  if (isSessionFailure(res)) return res
  if (!res.ok) return new NextResponse('Error al exportar', { status: res.status })

  const buffer = await res.arrayBuffer()
  const disposition = res.headers.get('content-disposition') ?? 'attachment; filename="gastos.xlsx"'

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': XLSX_TYPE,
      'Content-Disposition': disposition,
      'Cache-Control': 'no-store',
    },
  })
}
