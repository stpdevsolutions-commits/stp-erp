import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Excel del Formato 606: pasa la sesión y los filtros al API y devuelve el archivo. */
export async function GET(req: NextRequest) {
  const store = await cookies()
  const token = store.get('stp-token')?.value
  if (!token) return new NextResponse('Unauthorized', { status: 401 })

  const params = req.nextUrl.searchParams.toString()
  const res = await fetch(`${API_URL}/fiscal-invoices/export/606${params ? `?${params}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    // El API explica el motivo (p. ej. "acota el período"): se le pasa al usuario.
    const detail = await res.json().catch(() => null)
    const message = (detail as { message?: string } | null)?.message ?? 'Error al exportar'
    return new NextResponse(message, { status: res.status })
  }

  const buffer = await res.arrayBuffer()
  const disposition = res.headers.get('content-disposition') ?? 'attachment; filename="606.xlsx"'

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': XLSX_TYPE,
      'Content-Disposition': disposition,
      'Cache-Control': 'no-store',
    },
  })
}
