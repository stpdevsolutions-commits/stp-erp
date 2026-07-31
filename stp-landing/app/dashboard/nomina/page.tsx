import { api, pageError } from '@/lib/api'
import type {
  AuthUser,
  Collaborator,
  PaginatedResponse,
  PayrollEntry,
  PayrollSummary,
  Project,
} from '@/lib/types'
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
import { Paginacion } from '@/components/ui/paginacion'
import { FiltrosNomina } from '@/components/nomina/filtros-nomina'
import { NuevoPagoNominaDialog } from '@/components/nomina/nuevo-pago-nomina-dialog'
import { PagoNominaActions } from '@/components/nomina/pago-nomina-actions'

const STATUS_LABELS: Record<PayrollEntry['status'], string> = {
  pending: 'Pendiente',
  paid: 'Pagado',
  cancelled: 'Anulado',
}

// Colores semánticos de estado (tinte suave, coherente con la identidad STP)
const STATUS_BADGE: Record<PayrollEntry['status'], string> = {
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  paid: 'bg-green-600/10 text-green-700 dark:text-green-400',
  cancelled: 'bg-muted text-muted-foreground',
}

const METHOD_LABELS: Record<PayrollEntry['method'], string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  check: 'Cheque',
  other: 'Otro',
}

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })
const LIMIT = 20

const fecha = (d?: string) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('es-DO') : '—')

export default async function NominaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page ?? 1))

  const query = new URLSearchParams({ limit: String(LIMIT), page: String(page) })
  for (const key of ['search', 'status', 'collaboratorId', 'dateFrom', 'dateTo']) {
    if (sp[key]) query.set(key, sp[key])
  }

  let pagosRes: PaginatedResponse<PayrollEntry> = { data: [], total: 0, page, limit: LIMIT }
  let summary: PayrollSummary | null = null
  let collaborators: Collaborator[] = []
  let projects: Project[] = []
  let isAdmin = false
  let error: string | null = null

  try {
    const [res, sum, colabRes, proyRes, me] = await Promise.all([
      api.get<PaginatedResponse<PayrollEntry>>(`/payroll?${query}`),
      api.get<PayrollSummary>('/payroll/summary'),
      api.get<PaginatedResponse<Collaborator>>('/collaborators?limit=200'),
      api.get<PaginatedResponse<Project>>('/projects?limit=200'),
      // Solo ADMIN puede borrar (DELETE /payroll/:id): sin esto el menú ofrecería
      // una acción que la API rechaza.
      api.get<Pick<AuthUser, 'role'>>('/users/me').catch(() => ({ role: 'user' as const })),
    ])
    pagosRes = res
    summary = sum
    collaborators = colabRes.data
    projects = proyRes.data
    isAdmin = me.role === 'admin'
  } catch (e) {
    error = pageError(e, 'Error al cargar la nómina')
  }

  const pagos = pagosRes.data
  const activos = collaborators.filter((c) => c.status === 'active')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Nómina</h1>
          <p className="text-muted-foreground text-sm">
            Pagos a colaboradores por período trabajado
          </p>
        </div>
        <NuevoPagoNominaDialog collaborators={activos} projects={projects} />
      </div>

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Pagado este mes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {DOP.format(summary?.paidThisMonth ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary?.paidThisMonthCount ?? 0} pago(s)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Pendiente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {DOP.format(summary?.pendingAmount ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">{summary?.pendingCount ?? 0} pago(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Pagado en el año
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{DOP.format(summary?.paidThisYear ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Colaboradores activos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activos.length}</div>
          </CardContent>
        </Card>
      </div>

      <FiltrosNomina collaborators={collaborators} />

      {error ? (
        <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">
          {error}
        </div>
      ) : (
        <>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Proyecto</TableHead>
                  <TableHead className="text-right">Días × tarifa</TableHead>
                  <TableHead className="text-right">Neto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Pagado</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      No hay pagos de nómina registrados
                    </TableCell>
                  </TableRow>
                ) : (
                  pagos.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {p.number}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div>
                          {p.collaborator
                            ? `${p.collaborator.firstName} ${p.collaborator.lastName}`
                            : '—'}
                        </div>
                        {p.collaborator?.position && (
                          <div className="text-xs text-muted-foreground">
                            {p.collaborator.position}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {fecha(p.periodStart)} — {fecha(p.periodEnd)}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {p.project?.code ?? '—'}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {p.daysWorked && p.dailyRate
                          ? `${p.daysWorked} × ${DOP.format(p.dailyRate)}`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {DOP.format(p.netAmount)}
                        {p.deductions > 0 && (
                          <div className="text-xs text-muted-foreground">
                            bruto {DOP.format(p.grossAmount)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_BADGE[p.status]}>{STATUS_LABELS[p.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {p.status === 'paid' ? (
                          <>
                            <div>{fecha(p.paymentDate)}</div>
                            <div className="text-xs text-muted-foreground">
                              {METHOD_LABELS[p.method]}
                            </div>
                          </>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <PagoNominaActions
                          entry={p}
                          collaborators={collaborators}
                          projects={projects}
                          canDelete={isAdmin}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <Paginacion total={pagosRes.total} page={page} limit={LIMIT} />
        </>
      )}
    </div>
  )
}
