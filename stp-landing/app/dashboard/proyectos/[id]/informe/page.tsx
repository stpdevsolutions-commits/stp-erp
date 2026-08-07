import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, FileSpreadsheet, FileText, Lock } from 'lucide-react'
import { api, pageError } from '@/lib/api'
import type { User as AppUser } from '@/lib/types'
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
import { InformeEditor } from '@/components/proyectos/informe-editor'
import type {
  Informe,
  InformeCliente,
  InformeInterno,
  TipoInforme,
} from '@/lib/actions/project-reports'

/**
 * Informes de proyecto — dos documentos distintos, ambos editables.
 *
 *   · Interno — todo lo económico. MANAGER o ADMIN (lleva nómina y margen).
 *   · Cliente — lo que se entrega: avance, actividades, fichas, fotos y la
 *     cronología de sus pagos. Sin gastos, sin nómina y sin margen.
 *
 * Lo que se ve aquí es lo mismo que sale impreso: la pantalla y el PDF se
 * construyen con los mismos datos, así que no pueden decir cosas distintas.
 * Y en el informe de cliente no hay nada económico que ocultar en la vista —
 * el servidor no llega a consultarlo.
 */

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })
const money = (n: number | null | undefined) => (n == null ? '—' : DOP.format(n))
const fecha = (v?: string) => (v ? new Date(v).toLocaleDateString('es-DO') : '—')
const pct = (n: number | null | undefined) => (n == null ? '—' : `${n}%`)

const CATEGORIA: Record<string, string> = {
  materials: 'Materiales',
  labor: 'Mano de obra',
  equipment: 'Equipos',
  subcontract: 'Subcontrato',
  travel: 'Transporte',
  other: 'Otro',
}
const METODO: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  check: 'Cheque',
  card: 'Tarjeta',
  other: 'Otro',
}
const ESTADO_TAREA: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  review: 'En revisión',
  done: 'Completada',
  cancelled: 'Cancelada',
}
const TIPO_FICHA: Record<string, string> = {
  electrico: 'Eléctrico',
  civil: 'Civil',
  electromecanico: 'Electromecánico',
  levantamiento: 'Levantamiento',
  evaluacion_danos: 'Evaluación de daños',
}
const ESTADO_FICHA: Record<string, string> = {
  borrador: 'Borrador',
  en_progreso: 'En progreso',
  enviada: 'Enviada',
}
const es = (mapa: Record<string, string>, clave: string) => mapa[clave] ?? clave

/** Bloque de cifras calculadas: se muestra, no se edita. */
function Bloque({
  title,
  nota,
  headers,
  rows,
  vacio,
}: {
  title: string
  nota?: string
  headers: string[]
  rows: (string | number | null)[][]
  vacio: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{vacio}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {headers.map((h, i) => (
                  <TableHead key={h} className={i > 0 && i === headers.length - 1 ? 'text-right' : ''}>
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  {r.map((c, j) => (
                    <TableCell
                      key={j}
                      className={j > 0 && j === r.length - 1 ? 'text-right tabular-nums' : ''}
                    >
                      {c ?? '—'}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function VistaInterna({ r }: { r: InformeInterno }) {
  const presupuesto = r.project.budget ?? 0
  const margen = presupuesto > 0 ? presupuesto - r.expenses.total : null
  const margenPct =
    presupuesto > 0 ? Math.round(((presupuesto - r.expenses.total) / presupuesto) * 1000) / 10 : null
  const tareas = Object.entries(r.tasks ?? {})
  const totalTareas = tareas.reduce((a, [, n]) => a + n, 0)
  const avance = totalTareas > 0 ? Math.round(((r.tasks.done ?? 0) / totalTareas) * 1000) / 10 : null
  const inc = r.settings.include

  return (
    <div className="space-y-4">
      <Bloque
        title="Resumen económico"
        headers={['Concepto', 'Monto']}
        vacio=""
        rows={[
          ['Presupuesto', money(r.project.budget)],
          ['Gastos registrados', money(r.expenses.total)],
          ['Cobros recibidos', money(r.payments.total)],
          ['Balance (cobros − gastos)', money(r.balance)],
          ['Margen previsto (presupuesto − gastos)', money(margen)],
        ]}
      />

      <Bloque
        title="Presupuesto vs. real"
        headers={['Indicador', 'Valor']}
        vacio=""
        rows={[
          ['Presupuesto consumido', pct(r.expenses.budgetUsed)],
          ['Margen previsto sobre presupuesto', pct(margenPct)],
          ['Avance de tareas', pct(avance)],
        ]}
      />

      <Bloque
        title="Gastos por categoría"
        headers={['Categoría', 'Monto']}
        vacio="Sin gastos registrados"
        rows={Object.entries(r.expenses.byCategory).map(([c, m]) => [es(CATEGORIA, c), money(m)])}
      />

      {inc.detalleGastos && (
        <Bloque
          title="Detalle de gastos"
          headers={['Fecha', 'Descripción', 'Categoría', 'Proveedor', 'Monto']}
          vacio="Sin gastos registrados"
          rows={r.expenses.detail.map((e) => [
            fecha(e.date),
            e.description,
            es(CATEGORIA, e.category),
            e.supplier ?? '—',
            money(e.amount),
          ])}
        />
      )}

      {inc.nomina && (
        <Bloque
          title="Mano de obra imputada (nómina)"
          nota='Ya incluida en la categoría "Mano de obra" de los gastos: no se suma aparte.'
          headers={['Nº', 'Colaborador', 'Período', 'Días', 'Bruto']}
          vacio="Sin nómina imputada al proyecto"
          rows={r.payroll.entries.map((n) => [
            n.number,
            n.collaborator,
            `${fecha(n.periodStart)} → ${fecha(n.periodEnd)}`,
            n.days ?? 0,
            money(n.gross),
          ])}
        />
      )}

      {inc.tareas && (
        <Bloque
          title="Tareas por estado"
          headers={['Estado', 'Cantidad']}
          vacio="Sin tareas registradas"
          rows={tareas.map(([e, n]) => [es(ESTADO_TAREA, e), n])}
        />
      )}

      {inc.cronologia && (
        <Bloque
          title="Cobros recibidos"
          headers={['Fecha', 'Descripción', 'Método', 'Monto']}
          vacio="Sin cobros registrados"
          rows={r.payments.detail.map((p) => [
            fecha(p.date),
            p.description,
            es(METODO, p.method),
            money(p.amount),
          ])}
        />
      )}
    </div>
  )
}

function VistaCliente({ r }: { r: InformeCliente }) {
  const inc = r.settings.include
  return (
    <div className="space-y-4">
      <Bloque
        title="Avance de obra"
        headers={['Concepto', 'Valor']}
        vacio=""
        rows={[
          ['Ubicación', r.project.location || '—'],
          ['Fecha de inicio', fecha(r.project.startDate)],
          ['Fecha de término prevista', fecha(r.project.endDate)],
          ['Actividades completadas', `${r.progress.done} de ${r.progress.total}`],
          ['Avance', pct(r.progress.percent)],
        ]}
      />

      {inc.tareas && (
        <Bloque
          title="Actividades del proyecto"
          headers={['Actividad', 'Estado', 'Fecha prevista', 'Completada']}
          vacio="Sin actividades registradas"
          rows={r.tasks.map((t) => [
            t.title,
            es(ESTADO_TAREA, t.status),
            fecha(t.dueDate),
            fecha(t.completedAt),
          ])}
        />
      )}

      {inc.fichas && (
        <Bloque
          title="Fichas técnicas de campo"
          headers={['Código', 'Tipo', 'Estado', 'Fecha']}
          vacio="Sin fichas técnicas"
          rows={r.fichas.map((f) => [
            f.code,
            es(TIPO_FICHA, f.type),
            es(ESTADO_FICHA, f.status),
            fecha(f.date),
          ])}
        />
      )}

      {inc.fotos && (
        <Bloque
          title="Registro fotográfico"
          nota="En el documento se listan las fotos del proyecto; las imágenes se entregan aparte."
          headers={['Archivo', 'Fecha']}
          vacio="Sin fotos registradas"
          rows={r.photos.map((f) => [f.name, fecha(f.date)])}
        />
      )}

      {inc.cronologia && (
        <Bloque
          title="Cronología de pagos recibidos"
          headers={['Fecha', 'Concepto', 'Forma de pago', 'Monto']}
          vacio="Sin pagos registrados"
          rows={r.receipts.map((p) => [
            fecha(p.date),
            p.description,
            es(METODO, p.method),
            money(p.amount),
          ])}
        />
      )}
    </div>
  )
}

export default async function InformeProyectoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tipo?: string }>
}) {
  const { id } = await params
  const { tipo: tipoParam } = await searchParams

  const me = await api
    .get<Pick<AppUser, 'role'>>('/users/me')
    .catch((e) => {
      pageError(e, '')
      return { role: 'user' as const }
    })
  const puedeInterno = me.role === 'admin' || me.role === 'manager'

  // Un USER no puede ver el interno (lleva nómina): se le manda al de cliente
  // en vez de enseñarle un 403.
  const pedido: TipoInforme = tipoParam === 'interno' ? 'interno' : 'cliente'
  if (pedido === 'interno' && !puedeInterno) {
    redirect(`/dashboard/proyectos/${id}/informe?tipo=cliente`)
  }
  const tipo = pedido

  let informe: Informe
  try {
    informe = await api.get<Informe>(`/reports/projects/${id}/informe/${tipo}`)
  } catch {
    notFound()
  }

  const exportar = (format: 'pdf' | 'xlsx') =>
    `/api/export/informe?id=${id}&tipo=${tipo}&format=${format}`

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" render={<Link href={`/dashboard/proyectos/${id}`} />}>
          <ChevronLeft className="size-4" />
          Proyecto
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="font-mono text-sm text-muted-foreground">{informe.project.code}</span>
          <h1 className="text-2xl font-bold tracking-tight">
            {tipo === 'interno' ? 'Informe interno' : 'Informe para el cliente'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {informe.project.name}
            {informe.project.client ? ` · ${informe.project.client.name}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<a href={exportar('pdf')} target="_blank" rel="noopener noreferrer" />}
          >
            <FileText className="size-4 mr-1.5" />
            PDF
          </Button>
          <Button variant="outline" size="sm" render={<a href={exportar('xlsx')} download />}>
            <FileSpreadsheet className="size-4 mr-1.5" />
            Excel
          </Button>
        </div>
      </div>

      {/* Selector de tipo */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={tipo === 'cliente' ? 'default' : 'outline'}
          size="sm"
          render={<Link href={`/dashboard/proyectos/${id}/informe?tipo=cliente`} />}
        >
          Para el cliente
        </Button>
        {puedeInterno ? (
          <Button
            variant={tipo === 'interno' ? 'default' : 'outline'}
            size="sm"
            render={<Link href={`/dashboard/proyectos/${id}/informe?tipo=interno`} />}
          >
            Interno (económico)
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <Lock className="size-4 mr-1.5" />
            Interno (solo gerencia)
          </Button>
        )}
      </div>

      {tipo === 'interno' ? (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Documento interno: incluye gastos, nómina y margen. No entregar al cliente.
        </div>
      ) : (
        <div className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
          Documento para entregar. No contiene gastos, nómina ni margen: esos datos no entran
          siquiera en el archivo que se genera.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Editable
            </h2>
            <p className="text-xs text-muted-foreground">Textos, secciones y bloques a incluir.</p>
          </div>
          <InformeEditor projectId={id} tipo={tipo} ajustes={informe.settings} />
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Cifras calculadas
            </h2>
            <p className="text-xs text-muted-foreground">
              Salen de la base de datos y no se editan aquí. Para corregir una, corrige el gasto o
              el pago de origen.
            </p>
          </div>
          {informe.tipo === 'interno' ? (
            <VistaInterna r={informe} />
          ) : (
            <VistaCliente r={informe as InformeCliente} />
          )}
        </div>
      </div>
    </div>
  )
}
