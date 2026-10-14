import Link from 'next/link'
import { api, loadMain, loadSafe, failedLabels } from '@/lib/api'
import { LoadErrorBanner } from '@/components/ui/load-error-banner'
import type { Expense, Project, Supplier, Material, PaginatedResponse, User } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronLeft, FolderKanban, Truck, Calendar, Tag, FileText } from 'lucide-react'
import { GastoActions } from '@/components/expenses/gasto-actions'
import { formatDate } from '@/lib/utils'
import type { FiscalInvoice } from '@/lib/fiscal-invoices'

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

  const gasto = await loadMain(api.get<Expense>(`/expenses/${id}`))

  // La factura fiscal que originó este gasto, si la hay. Solo admin y finanzas pueden verla:
  // para el resto (403) o si el gasto no viene de una factura (404) simplemente no se muestra.
  const [facturaR, projectsR, suppliersR, materialsR, me] = await Promise.all([
    loadSafe(api.get<FiscalInvoice>(`/fiscal-invoices/by-expense/${id}`), null as FiscalInvoice | null),
    loadSafe(api.get<PaginatedResponse<Project>>('/projects?limit=200').then((r) => r.data), [] as Project[]),
    loadSafe(api.get<PaginatedResponse<Supplier>>('/suppliers?limit=200&isActive=true').then((r) => r.data), [] as Supplier[]),
    loadSafe(api.get<PaginatedResponse<Material>>('/costs/materials?limit=300&isActive=true').then((r) => r.data), [] as Material[]),
    api.get<Pick<User, 'role'>>('/users/me').catch(() => ({ role: 'user' as const })),
  ])
  const factura = facturaR.data
  const projects = projectsR.data
  const suppliers = suppliersR.data
  const materials = materialsR.data
  const loadErrors = failedLabels([
    ['factura fiscal vinculada', facturaR.failed],
    ['proyectos del formulario', projectsR.failed],
    ['proveedores del formulario', suppliersR.failed],
    ['materiales del formulario', materialsR.failed],
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" render={<Link href="/dashboard/gastos" />}>
          <ChevronLeft className="size-4" />
          Gastos
        </Button>
      </div>

      <LoadErrorBanner failed={loadErrors} />

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline">{CATEGORY_LABELS[gasto.category]}</Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{gasto.description}</h1>
          {/* El monto es el dato principal de un gasto: va grande, no como subtítulo. */}
          <p className="mt-2 text-2xl font-bold tabular-nums">{DOP.format(gasto.amount)}</p>
          {gasto.quantity != null && gasto.unitPrice != null && (
            <p className="text-muted-foreground text-sm">
              {gasto.quantity} {gasto.unit?.code ?? ''} × {DOP.format(gasto.unitPrice)}
              {gasto.itbisIncluded && ' (ITBIS incl.)'}
            </p>
          )}
        </div>
        <GastoActions gasto={gasto} projects={projects} suppliers={suppliers} materials={materials} userRole={me.role} />
      </div>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {!gasto.project && (
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <FolderKanban className="size-3.5" />
                <span className="text-xs">Proyecto</span>
              </div>
              <p className="font-medium text-sm">Gasto general (sin proyecto)</p>
            </CardContent>
          </Card>
        )}

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
            <p className="font-medium text-sm">{formatDate(gasto.date)}</p>
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

      {factura && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <FileText className="size-3.5" />
              <span className="text-xs">Factura fiscal</span>
            </div>
            <p className="text-sm">
              <span className="font-mono font-medium">{factura.ncf}</span> · {factura.supplierName}
              {factura.dgiiEstado ? ` · DGII: ${factura.dgiiEstado}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                render={<Link href={`/dashboard/facturas?search=${encodeURIComponent(factura.ncf)}`} />}
              >
                Ver la factura
              </Button>
              {factura.photoPath && (
                <Button
                  variant="outline"
                  size="sm"
                  render={<a href={`/api/files/fiscal-invoice/${factura.id}`} target="_blank" rel="noopener noreferrer" />}
                >
                  Ver comprobante
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Un gasto general no guarda PDF todavía (ERP-39): el botón solo va en gastos de proyecto. */}
      {gasto.projectId && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <FileText className="size-3.5" />
              <span className="text-xs">Comprobante</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              render={<a href={`/api/files/expense/${gasto.id}?v=${encodeURIComponent(gasto.updatedAt ?? gasto.createdAt)}`} target="_blank" rel="noopener noreferrer" />}
            >
              Ver PDF
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
