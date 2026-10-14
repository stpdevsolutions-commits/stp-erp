import { NextRequest, NextResponse } from 'next/server'
import { fetchWithSession, isSessionFailure } from '@/lib/session-fetch'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Excel de retenciones de la nómina de un mes: pasa la sesión al API y devuelve el archivo. */
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get('month') ?? ''
  const res = await fetchWithSession((token) =>
    fetch(`${API_URL}/payroll/export/retenciones?month=${encodeURIComponent(month)}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  )
  if (isSessionFailure(res)) return res
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    const message = (detail as { message?: string } | null)?.message ?? 'Error al exportar'
    return new NextResponse(message, { status: res.status })
  }
  const buffer = await res.arrayBuffer()
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': XLSX_TYPE,
      'Content-Disposition': res.headers.get('content-disposition') ?? 'attachment; filename="retenciones-nomina.xlsx"',
      'Cache-Control': 'no-store',
    },
  })
}
