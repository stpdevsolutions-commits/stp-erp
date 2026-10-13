import { redirect } from 'next/navigation'
import { NextRequest, NextResponse } from 'next/server'
import { fetchWithSession, isUuid } from '@/lib/session-fetch'

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
  if (!isUuid(id)) return new NextResponse('Ficha no válida', { status: 400 })

  const res = await fetchWithSession((token) =>
    fetch(`${API_URL}/fichas/${id}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    }),
  )

  // Se abre en una pestaña nueva: sin sesión recuperable, a /login (no un JSON suelto).
  if (res.status === 401) redirect('/login')
  if (res.status === 503) return res
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
