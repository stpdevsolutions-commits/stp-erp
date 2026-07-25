import { notFound } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { Quote, User, Client, Project, PaginatedResponse } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ChevronLeft, FileText, Calendar, User as UserIcon, FolderKanban, History } from 'lucide-react'
import { QuoteActions } from '@/components/quotes/quote-actions'
import { ConvertToProjectButton } from '@/components/quotes/convert-to-project-button'
import { ReviseQuoteButton } from '@/components/quotes/revise-quote-button'

const REVISABLE_STATUSES: Quote['status'][] = ['sent', 'approved', 'rejected', 'expired']

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
const DATE_TIME = new Intl.DateTimeFormat('es-DO', { dateStyle: 'medium', timeStyle: 'short' })

export default async function CotizacionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let quote: Quote
  try {
    quote = await api.get<Quote>(`/quotes/${id}`)
  } catch {
    notFound()
  }

  let userRole = 'user'
  let clients: Client[] = []
  let projects: Project[] = []
  try {
    const [me, clientsRes, projectsRes] = await Promise.all([
      api.get<Pick<User, 'role'>>('/users/me'),
      api.get<PaginatedResponse<Client>>('/clients?limit=200'),
      api.get<PaginatedResponse<Project>>('/projects?limit=200'),
    ])
    userRole = me.role
    clients = clientsRes.data
    projects = projectsRes.data
  } catch {
    // ignore
  }

  const indirectCosts = (
    quote as { indirectCosts?: { name: string; pct: number; amount: number; kind?: string }[] | null }
  ).indirectCosts
  const hasIndirect = Array.isArray(indirectCosts) && indirectCosts.length > 0

  const isManager = ['ADMIN', 'admin', 'MANAGER', 'manager'].includes(userRole)
  const isSuperseded = !!quote.supersededById
  const isRevisable = !isSuperseded && REVISABLE_STATUSES.includes(quote.status)
  const canRevise = isManager && isRevisable
  const revisionSummaries = quote.revisions ?? []
  const hasHistory = revisionSummaries.length > 1
  // Revisión que reemplaza a ésta (para el aviso de "reemplazada").
  const supersededBy = isSuperseded
    ? revisionSummaries.find((r) => r.id === quote.supersededById)
    : undefined

  // Group items by section
  const sections: Map<string, typeof quote.items> = new Map()
  for (const item of quote.items ?? []) {
    const key = item.sectionName ?? 'Sin sección'
    if (!sections.has(key)) sections.set(key, [])
    sections.get(key)!.push(item)
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" render={<Link href="/dashboard/cotizaciones" />}>
          <ChevronLeft className="size-4" />
          Cotizaciones
        </Button>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-mono text-sm text-muted-foreground">{quote.baseNumber ?? quote.number}</span>
            {quote.revision > 1 && (
              <Badge className="bg-primary/10 text-primary">Rev. {quote.revision}</Badge>
            )}
            <Badge className={STATUS_BADGE[quote.status]}>{STATUS_LABELS[quote.status]}</Badge>
            {isSuperseded && (
              <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">Reemplazada</Badge>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{quote.title}</h1>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {canRevise && (
            <ReviseQuoteButton quoteId={quote.id} quoteNumber={quote.number} />
          )}
          {!isSuperseded && quote.status === 'approved' && !quote.projectId && (
            <ConvertToProjectButton quoteId={quote.id} />
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={undefined}
            render={
              <a
                href={`/api/files/quote/${quote.id}?v=${Date.now()}`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <FileText className="size-4 mr-1.5" />
            Ver PDF
          </Button>
          <QuoteActions
            cotizacion={quote}
            clients={clients}
            projects={projects}
            userRole={userRole}
          />
        </div>
      </div>

      {/* Aviso de cotización reemplazada */}
      {isSuperseded && (
        <div className="rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 px-4 py-3 text-sm flex items-center gap-2">
          <History className="size-4 shrink-0" />
          <span>
            Esta cotización fue reemplazada por una revisión posterior y se conserva como documento
            histórico (no puede editarse ni reenviarse).
            {supersededBy && (
              <>
                {' '}
                <Link href={`/dashboard/cotizaciones/${supersededBy.id}`} className="font-medium underline">
                  Ver la revisión vigente ({supersededBy.number})
                </Link>
              </>
            )}
          </span>
        </div>
      )}

      {/* Historial de revisiones */}
      {hasHistory && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <History className="size-4" />
              Historial de revisiones
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ul className="divide-y">
              {revisionSummaries.map((rev) => {
                const isCurrent = rev.id === quote.id
                return (
                  <li key={rev.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-muted-foreground shrink-0">{rev.number}</span>
                      <Badge className="bg-muted text-muted-foreground shrink-0">
                        {rev.revision > 1 ? `Rev. ${rev.revision}` : 'Original'}
                      </Badge>
                      <Badge className={STATUS_BADGE[rev.status]}>{STATUS_LABELS[rev.status]}</Badge>
                      {!rev.supersededById && (
                        <Badge className="bg-green-600/10 text-green-700 dark:text-green-400 shrink-0">
                          Vigente
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="tabular-nums text-muted-foreground">{DOP.format(rev.total)}</span>
                      {isCurrent ? (
                        <span className="text-xs text-muted-foreground">actual</span>
                      ) : (
                        <Link
                          href={`/dashboard/cotizaciones/${rev.id}`}
                          className="text-xs text-primary hover:underline"
                        >
                          Ver
                        </Link>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Info cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <UserIcon className="size-3.5" />
              <span className="text-xs">Cliente</span>
            </div>
            {quote.client ? (
              <Link href={`/dashboard/clientes/${quote.client.id}`} className="hover:underline font-medium text-sm">
                {quote.client.name}
              </Link>
            ) : <p className="font-medium text-sm">—</p>}
            {quote.client?.email && (
              <p className="text-xs text-muted-foreground">{quote.client.email}</p>
            )}
          </CardContent>
        </Card>

        {quote.project && (
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <FolderKanban className="size-3.5" />
                <span className="text-xs">Proyecto</span>
              </div>
              <p className="font-medium text-sm">
                <Link
                  href={`/dashboard/proyectos/${quote.project.id}`}
                  className="hover:underline text-primary"
                >
                  {quote.project.code} — {quote.project.name}
                </Link>
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Calendar className="size-3.5" />
              <span className="text-xs">Válida hasta</span>
            </div>
            <p className="font-medium text-sm">
              {quote.validUntil ? new Date(quote.validUntil).toLocaleDateString('es-DO') : '—'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Calendar className="size-3.5" />
              <span className="text-xs">Creada</span>
            </div>
            <p className="font-medium text-sm">
              {new Date(quote.createdAt).toLocaleDateString('es-DO')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Seguimiento y decisión del cliente */}
      {(quote.sentAt || quote.decidedAt || (quote.reminderCount ?? 0) > 0) && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Seguimiento y decisión</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 grid gap-3 sm:grid-cols-3 text-sm">
            {quote.sentAt && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Enviada al cliente</p>
                <p className="font-medium">{DATE_TIME.format(new Date(quote.sentAt))}</p>
              </div>
            )}
            {(quote.reminderCount ?? 0) > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Recordatorios enviados</p>
                <p className="font-medium">
                  {quote.reminderCount}
                  {quote.lastReminderAt && (
                    <span className="text-muted-foreground font-normal">
                      {' '}· último {DATE_TIME.format(new Date(quote.lastReminderAt))}
                    </span>
                  )}
                </p>
              </div>
            )}
            {quote.decidedAt && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">
                  {quote.status === 'approved' ? 'Aprobada por el cliente' : 'Rechazada por el cliente'}
                </p>
                <p className="font-medium">{DATE_TIME.format(new Date(quote.decidedAt))}</p>
                {quote.decisionIp && (
                  <p className="text-xs text-muted-foreground">desde IP {quote.decisionIp}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Items by section */}
      {sections.size > 0 && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold">Partidas e ítems</h2>
          {Array.from(sections.entries()).map(([sectionName, items]) => (
            <Card key={sectionName}>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold">{sectionName}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Descripción</TableHead>
                        <TableHead className="w-24">Unidad</TableHead>
                        <TableHead className="text-right w-20">Cant.</TableHead>
                        <TableHead className="text-right w-32">Precio unit.</TableHead>
                        <TableHead className="text-right w-20">Desc.%</TableHead>
                        <TableHead className="text-right w-32">Total</TableHead>
                        {quote.taxRate > 0 && (
                          <TableHead className="text-right w-32">ITBIS</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => {
                        const rowItbis = quote.taxRate > 0 ? item.total * (quote.taxRate / 100) : 0
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="text-sm">{item.description}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{item.unit ?? '—'}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm">{item.quantity}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm">{DOP.format(item.unitPrice)}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm">
                              {item.discountPct ? `${item.discountPct}%` : '—'}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm font-medium">{DOP.format(item.total)}</TableCell>
                            {quote.taxRate > 0 && (
                              <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                                {DOP.format(rowItbis)}
                              </TableCell>
                            )}
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-80 space-y-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>{hasIndirect ? 'Subtotal costos directos' : 'Subtotal'}</span>
            <span className="tabular-nums">{DOP.format(quote.subtotal)}</span>
          </div>
          {(quote.discount ?? 0) > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Descuento</span>
              <span className="tabular-nums">- {DOP.format(quote.discount ?? 0)}</span>
            </div>
          )}
          {hasIndirect ? (
            <>
              <div className="pt-1 text-xs font-semibold uppercase text-muted-foreground">
                Gastos indirectos
              </div>
              {indirectCosts!.map((c, i) => (
                <div key={i} className="flex justify-between text-muted-foreground">
                  <span>
                    {c.name}{' '}
                    <span className="text-xs">
                      ({c.pct}%{c.kind === 'itbis' ? ' Dir. Técnica' : ''})
                    </span>
                  </span>
                  <span className="tabular-nums">{DOP.format(c.amount)}</span>
                </div>
              ))}
            </>
          ) : (
            quote.taxRate > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>ITBIS ({quote.taxRate}%)</span>
                <span className="tabular-nums">{DOP.format(quote.taxAmount)}</span>
              </div>
            )
          )}
          <div className="flex justify-between font-semibold text-base border-t pt-2">
            <span>Total</span>
            <span className="tabular-nums">{DOP.format(quote.total)}</span>
          </div>
        </div>
      </div>

      {/* Notes and Terms */}
      {(quote.notes || quote.terms) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {quote.notes && (
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm">Notas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{quote.notes}</p>
              </CardContent>
            </Card>
          )}
          {quote.terms && (
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm">Términos y condiciones</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{quote.terms}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
