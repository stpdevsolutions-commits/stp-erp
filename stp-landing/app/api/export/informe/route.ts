import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * Descarga de los informes de proyecto (interno / cliente).
 *
 * Ruta propia y no la de `/api/export/reporte` porque estos llevan un `tipo` que
 * decide QUÉ documento se construye: el interno con toda la economía, el de
 * cliente sin ella. El `tipo` se valida contra una lista fija antes de tocar la
 * URL de la API, para que un parámetro manipulado no pueda pedir el informe
 * interno escribiendo cualquier cosa. Quién puede ver cuál lo decide la API
 * (el interno exige MANAGER+); aquí solo se adjunta el token.
 */
const TIPOS = ['interno', 'cliente'] as const

export async function GET(req: NextRequest) {
  const store = await cookies()
  const token = store.get('stp-token')?.value
  if (!token) return new NextResponse('Unauthorized', { status: 401 })

  const sp = req.nextUrl.searchParams
  const id = sp.get('id')
  const tipo = sp.get('tipo') ?? ''
  const formato = sp.get('format') === 'pdf' ? 'pdf' : 'xlsx'

  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('Proyecto no válido', { status: 400 })
  if (!(TIPOS as readonly string[]).includes(tipo))
    return new NextResponse('Tipo de informe no válido', { status: 400 })

  const res = await fetch(
    `${API_URL}/reports/projects/${id}/informe/${tipo}/export?format=${formato}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  )
  if (!res.ok) return new NextResponse('Error al exportar', { status: res.status })

  const buffer = await res.arrayBuffer()
  const disposition =
    res.headers.get('content-disposition') ??
    `${formato === 'pdf' ? 'inline' : 'attachment'}; filename="informe.${formato}"`

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': formato === 'pdf' ? 'application/pdf' : XLSX_TYPE,
      'Content-Disposition': disposition,
      'Cache-Control': 'no-store',
    },
  })
}
