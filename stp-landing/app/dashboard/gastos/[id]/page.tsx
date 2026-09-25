import { notFound } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { Expense, Project, Supplier, Material, PaginatedResponse, User } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronLeft, FolderKanban, Truck, Calendar, Tag, FileText } from 'lucide-react'
import { GastoActions } from '@/components/expenses/gasto-actions'

const CATEGORY_LABELS: Record<Expense['category'], string> = {
  materials: 'Materiales',
  labor: 'Mano de obra',
  equipment: 'Equipos',
  subcontract: 'Subcontrato',
  travel: 'Transporte',
  other: 'Otro',
}

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

export default async function GastoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let gasto: Expense
  try {
    gasto = await api.get<Expense>(`/expenses/${id}`)
  } catch {
    notFound()
  }

  const [projects, suppliers, materials, me] = await Promise.all([
    api.get<PaginatedResponse<Project>>('/projects?limit=200').then((r) => r.data).catch(() => [] as Project[]),
    api.get<PaginatedResponse<Supplier>>('/suppliers?limit=200&isActive=true').then((r) => r.data).catch(() => [] as Supplier[]),
    api.get<PaginatedResponse<Material>>('/costs/materials?limit=300&isActive=true').then((r) => r.data).catch(() => [] as Material[]),
    api.get<Pick<User, 'role'>>('/users/me').catch(() => ({ role: 'user' as const })),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" render={<Link href="/dashboard/gastos" />}>
          <ChevronLeft className="size-4" />
          Gastos
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline">{CATEGORY_LABELS[gasto.category]}</Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{gasto.description}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {DOP.format(gasto.amount)}
            {gasto.quantity != null && gasto.unitPrice != null && (
              <span>
                {' '}· {gasto.quantity} {gasto.unit?.code ?? ''} × {DOP.format(gasto.unitPrice)}
                {gasto.itbisIncluded && ' (ITBIS incl.)'}
              </span>
            )}
          </p>
        </div>
        <GastoActions gasto={gasto} projects={projects} suppliers={suppliers} materials={materials} userRole={me.role} />
      </div>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {gasto.project && (
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <FolderKanban className="size-3.5" />
                <span className="text-xs">Proyecto</span>
              </div>
              <Link href={`/dashboard/proyectos/${gasto.project.id}`} className="font-medium text-sm hover:underline">
                {gasto.project.code} — {gasto.project.name}
              </Link>
            </CardContent>
          </Card>
        )}

        {gasto.supplier && (
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Truck className="size-3.5" />
                <span className="text-xs">Proveedor</span>
              </div>
              <p className="font-medium text-sm">{gasto.supplier.name}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Calendar className="size-3.5" />
              <span className="text-xs">Fecha</span>
            </div>
            <p className="font-medium text-sm">{new Date(gasto.date).toLocaleDateString('es-DO')}</p>
          </CardContent>
        </Card>

        {gasto.material && (
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Tag className="size-3.5" />
                <span className="text-xs">Material</span>
              </div>
              <Link href={`/dashboard/costos/materiales/${gasto.material.id}`} className="font-medium text-sm hover:underline">
                {gasto.material.code} — {gasto.material.name}
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      {gasto.notes && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">Notas</p>
            <p className="text-sm whitespace-pre-wrap">{gasto.notes}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <FileText className="size-3.5" />
            <span className="text-xs">Comprobante</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            render={<a href={`/api/files/expense/${gasto.id}?v=${Date.now()}`} target="_blank" rel="noopener noreferrer" />}
          >
            Ver PDF
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
