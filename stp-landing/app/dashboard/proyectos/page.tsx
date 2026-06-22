﻿import Link from 'next/link'
import { api } from '@/lib/api'
import type { Client, Project, PaginatedResponse } from '@/lib/types'
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
import { NuevoProyectoDialog } from '@/components/projects/nuevo-proyecto-dialog'
import { ProjectActions } from '@/components/projects/project-actions'
import { FiltrosProyectos } from '@/components/proyectos/filtros-proyectos'
import { Paginacion } from '@/components/ui/paginacion'

const STATUS_LABELS: Record<Project['status'], string> = {
  draft: 'Pendiente',
  active: 'En curso',
  on_hold: 'En pausa',
  completed: 'Completado',
  cancelled: 'Cancelado',
}

const STATUS_VARIANTS: Record<Project['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  active: 'default',
  on_hold: 'outline',
  completed: 'default',
  cancelled: 'destructive',
}

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })
const LIMIT = 20

export default async function ProyectosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page ?? 1))

  const q = new URLSearchParams({ limit: String(LIMIT), page: String(page) })
  if (sp.search) q.set('search', sp.search)
  if (sp.status) q.set('status', sp.status)

  let proyectosRes: PaginatedResponse<Project> = { data: [], total: 0, page, limit: LIMIT }
  let clients: Client[] = []
  let error: string | null = null

  try {
    const [proyRes, clientRes] = await Promise.all([
      api.get<PaginatedResponse<Project>>(`/projects?${q.toString()}`),
      api.get<PaginatedResponse<Client>>('/clients?limit=200&isActive=true'),
    ])
    proyectosRes = proyRes
    clients = clientRes.data
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar datos'
  }

  const proyectos = proyectosRes.data
  const byStatus = Object.fromEntries(
    Object.keys(STATUS_LABELS).map((s) => [s, proyectos.filter((p) => p.status === s).length]),
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Proyectos</h1>
          <p className="text-muted-foreground text-sm">Gestión de proyectos de construcción y electromecánica</p>
        </div>
        <NuevoProyectoDialog clients={clients} />
      </div>

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        {(['draft', 'active', 'completed', 'cancelled'] as const).map((s) => (
          <Card key={s}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{STATUS_LABELS[s]}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{byStatus[s] ?? 0}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <FiltrosProyectos />

      {error ? (
        <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>
      ) : (
        <>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Presupuesto</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {proyectos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No hay proyectos que coincidan con los filtros
                    </TableCell>
                  </TableRow>
                ) : (
                  proyectos.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-sm">
                        <Link href={`/dashboard/proyectos/${p.id}`} className="hover:underline">
                          {p.code}
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/dashboard/proyectos/${p.id}`} className="hover:underline">
                          <div>{p.name}</div>
                          {p.startDate && (
                            <div className="text-xs text-muted-foreground">
                              Inicio: {new Date(p.startDate).toLocaleDateString('es-DO')}
                            </div>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {p.client ? (
                          <Link href={`/dashboard/clientes/${p.client.id}`} className="hover:underline">
                            {p.client.name}
                          </Link>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[p.status]}>{STATUS_LABELS[p.status]}</Badge>
                      </TableCell>
                      <TableCell>{p.budget != null ? DOP.format(p.budget) : '—'}</TableCell>
                      <TableCell>
                        <ProjectActions proyecto={p} clients={clients} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <Paginacion total={proyectosRes.total} page={page} limit={LIMIT} />
        </>
      )}
    </div>
  )
}
