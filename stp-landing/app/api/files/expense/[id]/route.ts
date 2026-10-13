import { NextRequest, NextResponse } from 'next/server'
import { fetchWithSession, isUuid } from '@/lib/session-fetch'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!isUuid(id)) return new NextResponse('Gasto no válido', { status: 400 })

  // Toda la secuencia va dentro del callback: si el token venció, fetchWithSession
  // renueva la sesión y la repite completa con el token nuevo.
  return fetchWithSession(async (token) => {
    const auth = { Authorization: `Bearer ${token}` }

    const fileRes = await fetch(`${API_URL}/expenses/${id}/pdf-file`, { headers: auth })
    if (fileRes.status === 401) return fileRes
    if (!fileRes.ok) return new NextResponse('PDF no disponible', { status: 404 })
    const record = await fileRes.json() as { id: string; originalName: string }

    const downloadRes = await fetch(`${API_URL}/files/${record.id}/download`, { headers: auth })
    if (downloadRes.status === 401) return downloadRes
    if (!downloadRes.ok) return new NextResponse('Archivo no encontrado', { status: 404 })

    const contentType = downloadRes.headers.get('content-type') ?? 'application/pdf'
    const contentDisposition =
      downloadRes.headers.get('content-disposition') ??
      `inline; filename="${record.originalName}"`

    return new NextResponse(downloadRes.body, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': contentDisposition,
        'Cache-Control': 'no-store',
      },
    })
  })
}
