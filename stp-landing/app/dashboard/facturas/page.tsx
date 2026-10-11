import { StatCard } from '@/components/ui/stat-card'
import Link from 'next/link'
import { Camera, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api, pageError } from '@/lib/api'
import type { PaginatedResponse, Project, User } from '@/lib/types'
import type { FiscalInvoice } from '@/lib/fiscal-invoices'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NuevaFacturaDialog } from '@/components/facturas/factura-form'
import { FacturasTabla } from '@/components/facturas/facturas-tabla'
import { FiltrosFacturas } from '@/components/facturas/filtros-facturas'
import { Paginacion } from '@/components/ui/paginacion'
import { ValidarPendientesButton } from '@/components/facturas/validar-pendientes'
import { ExportExcelButton } from '@/components/ui/export-excel-button'

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })
const LIMIT = 20

export default async function FacturasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page ?? 1))

  const q = new URLSearchParams({ limit: String(LIMIT), page: String(page) })
  for (const key of ['search', 'dateFrom', 'dateTo', 'expenseType', 'project', 'projectId', 'paymentMethod', 'ncfType', 'dgii', 'assigned', 'hasPhoto', 'amountMin', 'amountMax']) {
    if (sp[key]) q.set(key, sp[key])
  }

  let res: PaginatedResponse<FiscalInvoice> & { totalAmount?: number } = { data: [], total: 0, page, limit: LIMIT }
  let projects: Project[] = []
  let userRole = 'USER'
  let error: string | null = null

  try {
    const [list, me, proyRes] = await Promise.all([
      api.get<PaginatedResponse<FiscalInvoice> & { totalAmount?: number }>(`/fiscal-invoices?${q.toString()}`),
      api.get<Pick<User, 'role'>>('/users/me'),
      api.get<PaginatedResponse<Project>>('/projects?limit=200'),
    ])
    res = list
    userRole = me.role
    projects = proyRes.data
  } catch (e) {
    error = pageError(e, 'Error al cargar las facturas')
  }

  // El 606 sale con los mismos filtros de la pantalla (sin página ni límite): lo normal es
  // filtrar por el mes que se declara.
  const exportQuery = new URLSearchParams()
  for (const key of ['search', 'dateFrom', 'dateTo', 'expenseType', 'project', 'projectId', 'paymentMethod', 'ncfType', 'dgii', 'assigned', 'hasPhoto', 'amountMin', 'amountMax']) {
    if (sp[key]) exportQuery.set(key, sp[key])
  }

  const hayFiltros = ['search', 'dateFrom', 'dateTo', 'expenseType', 'project', 'projectId', 'paymentMethod', 'ncfType', 'dgii', 'assigned', 'hasPhoto', 'amountMin', 'amountMax'].some((k) => sp[k])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Facturas recibidas</h1>
          <p className="text-muted-foreground text-sm">
            Comprobantes de compra que nos hacen los proveedores (Formato 606), con o sin proyecto
          </p>
        </div>
        <div className="flex flex-wrap gap-2 max-sm:w-full">
          {['admin', 'finanza'].includes(userRole.toLowerCase()) ? <ValidarPendientesButton /> : null}
          {['admin', 'finanza'].includes(userRole.toLowerCase()) ? (
            <Button variant="outline" render={<Link href="/dashboard/facturas/conciliar" />} className="gap-2">
              <Link2 className="size-4" />
              Conciliar
            </Button>
          ) : null}
          <ExportExcelButton href={`/api/export/facturas-606?${exportQuery.toString()}`} label="Exportar 606" />
          <Button variant="outline" render={<Link href="/dashboard/escanear" />} className="gap-2">
            <Camera className="size-4" />
            Escanear
          </Button>
          <NuevaFacturaDialog projects={projects} />
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <StatCard label={<>{hayFiltros ? 'Facturas filtradas' : 'Total de facturas'}</>}><div className="text-2xl font-bold">{res.total}</div></StatCard>
        <StatCard label={<>{hayFiltros ? 'Monto filtrado' : 'Monto total'}</>}><div className="text-2xl font-bold">{DOP.format(res.totalAmount ?? 0)}</div></StatCard>
      </div>

      <FiltrosFacturas projects={projects} />

      {error ? (
        <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>
      ) : (
        <>
          <FacturasTabla facturas={res.data} projects={projects} userRole={userRole} hayFiltros={hayFiltros} />
          <Paginacion total={res.total} page={page} limit={LIMIT} />
        </>
      )}
    </div>
  )
}
