import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const store = await cookies()
  const token = store.get('stp-token')?.value

  if (!token) return new NextResponse('Unauthorized', { status: 401 })

  const fileRes = await fetch(`${API_URL}/quotes/${id}/pdf-file`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!fileRes.ok) return new NextResponse('PDF no disponible', { status: 404 })
  const record = await fileRes.json() as { id: string; originalName: string }

  const downloadRes = await fetch(`${API_URL}/files/${record.id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!downloadRes.ok) return new NextResponse('Archivo no encontrado', { status: 404 })

  const contentType = downloadRes.headers.get('content-type') ?? 'application/pdf'
  const contentDisposition =
    downloadRes.headers.get('content-disposition') ??
    `inline; filename="${record.originalName}"`

  return new NextResponse(downloadRes.body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': contentDisposition,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
