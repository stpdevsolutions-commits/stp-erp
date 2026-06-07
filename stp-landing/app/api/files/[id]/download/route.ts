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

  if (!token) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const res = await fetch(`${API_URL}/files/${id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  })

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
