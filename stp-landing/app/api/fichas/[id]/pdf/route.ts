import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

const PRINT_SCRIPT = `
<script>
  window.addEventListener('load', () => {
    setTimeout(() => { window.print(); }, 300);
  });
</script>
`

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const store = await cookies()
  const token = store.get('stp-token')?.value
  if (!token) redirect('/login')

  const res = await fetch(`${API_URL}/fichas/${id}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })

  if (res.status === 401) redirect('/login')
  if (!res.ok) return new NextResponse('Error al generar el PDF', { status: res.status })

  const html = await res.text()

  // Inject print script before </body>
  const printableHtml = html.includes('</body>')
    ? html.replace('</body>', `${PRINT_SCRIPT}</body>`)
    : html + PRINT_SCRIPT

  return new NextResponse(printableHtml, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
