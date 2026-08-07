import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * Descarga de reportes. Una sola ruta para todos los tipos porque todos hacen lo
 * mismo: adjuntar el token de la cookie y devolver el archivo tal cual.
 *
 * El `tipo` se traduce contra una tabla fija en vez de interpolarse en la URL:
 * así un parámetro manipulado no puede apuntar a otro endpoint de la API.
 */
const RUTAS: Record<string, (id: string | null) => string | null> = {
  general: () => '/reports/general/export',
  ingresos: () => '/reports/income/export',
  gastos: () => '/reports/expenses/export',
  fichas: () => '/reports/fichas/export',
  proyecto: (id) => (id ? `/reports/projects/${id}/export` : null),
  cliente: (id) => (id ? `/reports/clients/${id}/export` : null),
}

export async function GET(req: NextRequest) {
  const store = await cookies()
  const token = store.get('stp-token')?.value
  if (!token) return new NextResponse('Unauthorized', { status: 401 })

  const sp = req.nextUrl.searchParams
  const tipo = sp.get('tipo') ?? ''
  const formato = sp.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const id = sp.get('id')

  const ruta = RUTAS[tipo]?.(id)
  if (!ruta) return new NextResponse('Reporte no válido', { status: 400 })

  const params = new URLSearchParams({ format: formato })
  for (const clave of ['from', 'to']) {
    const valor = sp.get(clave)
    if (valor) params.set(clave, valor)
  }

  const res = await fetch(`${API_URL}${ruta}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (!res.ok) return new NextResponse('Error al exportar', { status: res.status })

  const buffer = await res.arrayBuffer()
  const disposition =
    res.headers.get('content-disposition') ??
    `${formato === 'pdf' ? 'inline' : 'attachment'}; filename="reporte.${formato}"`

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': formato === 'pdf' ? 'application/pdf' : XLSX_TYPE,
      'Content-Disposition': disposition,
      'Cache-Control': 'no-store',
    },
  })
}
