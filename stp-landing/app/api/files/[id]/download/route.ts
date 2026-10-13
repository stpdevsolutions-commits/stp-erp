import { NextRequest, NextResponse } from 'next/server'
import { fetchWithSession, isSessionFailure, isUuid } from '@/lib/session-fetch'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!isUuid(id)) return new NextResponse('Archivo no válido', { status: 400 })

  const res = await fetchWithSession((token) =>
    fetch(`${API_URL}/files/${id}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  )
  if (isSessionFailure(res)) return res

  if (!res.ok) {
    return new NextResponse('Not found', { status: res.status })
  }

  const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
  const contentDisposition = res.headers.get('content-disposition') ?? ''

  return new NextResponse(res.body, {
    headers: {
      'Content-Type': contentType,
      ...(contentDisposition && { 'Content-Disposition': contentDisposition }),
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
