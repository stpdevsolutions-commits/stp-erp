import Link from 'next/link'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { api, pageError } from '@/lib/api'
import type { Acu, Client, Project, Quote, PaginatedResponse, User } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NuevaCotizacionDialog } from '@/components/quotes/nueva-cotizacion-dialog'
import { QuoteActions } from '@/components/quotes/quote-actions'
import { FiltrosCotizaciones } from '@/components/cotizaciones/filtros-cotizaciones'
import { Paginacion } from '@/components/ui/paginacion'
import { ExportExcelButton } from '@/components/ui/export-excel-button'

const STATUS_LABELS: Record<Quote['status'], string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  expired: 'Expirada',
}

// Colores semánticos de estado (tinte suave, coherente con la identidad STP)
const STATUS_BADGE: Record<Quote['status'], string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-primary/10 text-primary',
  approved: 'bg-green-600/10 text-green-700 dark:text-green-400',
  rejected: 'bg-destructive/10 text-destructive',
  expired: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
}

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })
const LIMIT = 20

export default async function CotizacionesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page ?? 1))

  const q = new URLSearchParams({ limit: String(LIMIT), page: String(page) })
  if (sp.search) q.set('search', sp.search)
  if (sp.status) q.set('status', sp.status)

  let cotizacionesRes: PaginatedResponse<Quote> = { data: [], total: 0, page, limit: LIMIT }
  let projects: Project[] = []
  let clients: Client[] = []
  let userRole: string = 'USER'
  let defaultTerms = ''
  let acus: Acu[] = []
  let error: string | null = null

  try {
    const [quotesRes, proyRes, clientsRes, meRes, termsRes, acusRes] = await Promise.allSettled([
      api.get<PaginatedResponse<Quote>>(`/quotes?${q.toString()}`),
      api.get<PaginatedResponse<Project>>('/projects?limit=200'),
      api.get<PaginatedResponse<Client>>('/clients?limit=200'),
      api.get<Pick<User, 'role'>>('/users/me'),
      api.get<{ terms: string | null }>('/settings/terms'),
      // Partidas de costos con su costo de hoy, para cotizar desde una receta.
      api.get<PaginatedResponse<Acu>>('/costs/acus?limit=200&withCost=true'),
    ])
    if (quotesRes.status === 'fulfilled') cotizacionesRes = quotesRes.value
    else error = pageError(quotesRes.reason, 'Error al cargar cotizaciones')
    if (proyRes.status === 'fulfilled') projects = proyRes.value.data
    if (clientsRes.status === 'fulfilled') clients = clientsRes.value.data
    if (meRes.status === 'fulfilled') userRole = meRes.value.role
    if (termsRes.status === 'fulfilled') defaultTerms = termsRes.value.terms ?? ''
    if (acusRes.status === 'fulfilled') acus = acusRes.value.data
  } catch (e) {
    // pageError() puede haber lanzado el redirect a /api/auth/logout (401);
    // ese error NEXT_REDIRECT debe propagarse, no tratarse como error de datos.
    if (isRedirectError(e)) throw e
    error = pageError(e, 'Error al cargar cotizaciones')
  }

  const cotizaciones = cotizacionesRes.data
  const totalAprobado = cotizaciones
    .filter((c) => c.status === 'approved')
    .reduce((sum, c) => sum + c.total, 0)
  const totalPendiente = cotizaciones
    .filter((c) => c.status === 'sent')
    .reduce((sum, c) => sum + c.total, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cotizaciones</h1>
          <p className="text-muted-foreground text-sm">Gestión de cotizaciones y propuestas</p>
        </div>
        <div className="flex gap-2">
          <ExportExcelButton href={`/api/export/cotizaciones?${q.toString()}`} label="Exportar Excel" />
          <NuevaCotizacionDialog
            clients={clients}
            projects={projects}
            defaultTerms={defaultTerms}
            acus={acus}
          />
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total cotizaciones</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{cotizacionesRes.total}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Monto aprobado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{DOP.format(totalAprobado)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Monto pendiente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{DOP.format(totalPendiente)}</div>
          </CardContent>
        </Card>
      </div>

      <FiltrosCotizaciones />

      {error ? (
        <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>
      ) : (
        <>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Válida hasta</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {cotizaciones.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No hay cotizaciones que coincidan con los filtros
                    </TableCell>
                  </TableRow>
                ) : (
                  cotizaciones.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell className="font-mono text-sm">
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/dashboard/cotizaciones/${q.id}`}
                            className="hover:underline text-primary"
                          >
                            {q.baseNumber ?? q.number}
                          </Link>
                          {q.revision > 1 && (
                            <Badge className="bg-primary/10 text-primary text-[10px] px-1.5 py-0">
                              Rev. {q.revision}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        <div>{q.title}</div>
                        {q.project && (
                          <div className="text-xs text-muted-foreground">
                            <Link href={`/dashboard/proyectos/${q.project.id}`} className="hover:underline">
                              {q.project.code} — {q.project.name}
                            </Link>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {q.client ? (
                          <Link href={`/dashboard/clientes/${q.client.id}`} className="hover:underline">
                            {q.client.name}
                          </Link>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_BADGE[q.status]}>{STATUS_LABELS[q.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {DOP.format(q.total)}
                      </TableCell>
                      <TableCell>
                        {q.validUntil ? new Date(q.validUntil).toLocaleDateString('es-DO') : '—'}
                      </TableCell>
                      <TableCell>
                        <QuoteActions cotizacion={q} projects={projects} clients={clients} userRole={userRole} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <Paginacion total={cotizacionesRes.total} page={page} limit={LIMIT} />
        </>
      )}
    </div>
  )
}
