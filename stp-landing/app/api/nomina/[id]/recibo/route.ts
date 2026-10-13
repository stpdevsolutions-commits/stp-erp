import { redirect } from 'next/navigation'
import { NextRequest, NextResponse } from 'next/server'
import { fetchWithSession, isUuid } from '@/lib/session-fetch'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

/**
 * Recibo de nómina en PDF. Va por aquí y no directo a la API porque el token
 * vive en una cookie del dominio del frontend: un `<a href>` a la API iría sin
 * cabecera de autorización.
 *
 * Se sirve `inline` para que el navegador lo abra en su visor, desde donde se
 * imprime o se guarda.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!isUuid(id)) return new NextResponse('Recibo no válido', { status: 400 })

  const res = await fetchWithSession((token) =>
    fetch(`${API_URL}/payroll/${id}/recibo`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    }),
  )

  // Se abre en una pestaña nueva: sin sesión recuperable, a /login (no un JSON suelto).
  if (res.status === 401) redirect('/login')
  if (res.status === 503) return res
  if (!res.ok) return new NextResponse('Error al generar el recibo', { status: res.status })

  const buffer = await res.arrayBuffer()
  const disposition = res.headers.get('content-disposition') ?? `inline; filename="recibo.pdf"`

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': disposition,
      'Cache-Control': 'no-store',
    },
  })
}
