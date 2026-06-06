import { api } from '@/lib/api'
import type { Project, PaginatedResponse } from '@/lib/types'
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
import { FolderKanban } from 'lucide-react'

const STATUS_LABELS: Record<Project['status'], string> = {
  pending: 'Pendiente',
  'in-progress': 'En curso',
  'on-hold': 'En pausa',
  completed: 'Completado',
  cancelled: 'Cancelado',
}

const STATUS_VARIANTS: Record<Project['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  'in-progress': 'default',
  'on-hold': 'outline',
  completed: 'default',
  cancelled: 'destructive',
}

export default async function ProyectosPage() {
  let proyectos: Project[] = []
  let error: string | null = null

  try {
    const res = await api.get<PaginatedResponse<Project>>('/projects?limit=100')
    proyectos = res.data
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar proyectos'
  }

  const byStatus = Object.fromEntries(
    Object.keys(STATUS_LABELS).map((s) => [s, proyectos.filter((p) => p.status === s).length]),
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Proyectos</h1>
        <p className="text-muted-foreground text-sm">Gestión de proyectos de construcción y electromecánica</p>
      </div>

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        {(['pending', 'in-progress', 'completed', 'cancelled'] as const).map((s) => (
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

      {error ? (
        <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Presupuesto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proyectos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No hay proyectos registrados
                  </TableCell>
                </TableRow>
              ) : (
                proyectos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-sm">{p.code}</TableCell>
                    <TableCell className="font-medium">{p.title}</TableCell>
                    <TableCell>{p.client?.name ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[p.status]}>{STATUS_LABELS[p.status]}</Badge>
                    </TableCell>
                    <TableCell>
                      {p.budget != null
                        ? new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(p.budget)
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
