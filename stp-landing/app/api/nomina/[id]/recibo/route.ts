import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextRequest, NextResponse } from 'next/server'

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
  const store = await cookies()
  const token = store.get('stp-token')?.value
  if (!token) redirect('/login')

  const res = await fetch(`${API_URL}/payroll/${id}/recibo`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })

  if (res.status === 401) redirect('/login')
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
