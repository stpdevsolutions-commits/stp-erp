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
import { ChevronLeft, FileText, Calendar, User as UserIcon, FolderKanban } from 'lucide-react'
import { QuoteActions } from '@/components/quotes/quote-actions'

const STATUS_LABELS: Record<Quote['status'], string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  expired: 'Expirada',
}
const STATUS_VARIANTS: Record<Quote['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  sent: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  expired: 'secondary',
}

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

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
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm text-muted-foreground">{quote.number}</span>
            <Badge variant={STATUS_VARIANTS[quote.status]}>{STATUS_LABELS[quote.status]}</Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{quote.title}</h1>
        </div>
        <div className="flex gap-2 items-center">
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

      {/* Info cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <UserIcon className="size-3.5" />
              <span className="text-xs">Cliente</span>
            </div>
            <p className="font-medium text-sm">{quote.client?.name ?? '—'}</p>
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
        <div className="w-72 space-y-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span className="tabular-nums">{DOP.format(quote.subtotal)}</span>
          </div>
          {quote.taxRate > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>ITBIS ({quote.taxRate}%)</span>
              <span className="tabular-nums">{DOP.format(quote.taxAmount)}</span>
            </div>
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
