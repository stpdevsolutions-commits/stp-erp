'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Project, Ticket } from '@/lib/types'
import { NuevoTicketDialog } from './nuevo-ticket-dialog'
import { TicketActions } from './ticket-actions'
import { TYPE_LABELS, STATUS_LABELS, PRIORITY_LABELS, PRIORITY_BADGE, STATUS_BADGE, PRIORITY_WEIGHT } from './labels'

const TODOS = '__todos__'

type SortKey = 'number_desc' | 'number_asc' | 'priority_desc' | 'priority_asc'

const SORT_LABELS: Record<SortKey, string> = {
  number_desc: 'Más recientes primero',
  number_asc: 'Más antiguos primero',
  priority_desc: 'Prioridad: alta a baja',
  priority_asc: 'Prioridad: baja a alta',
}

/** "FRD-7" si el proyecto ya tiene código, o "#7" (número global) si por lo
 * que sea no vino el proyecto en la respuesta — nunca deja la celda vacía. */
function ticketCode(t: Ticket, project?: Project): string {
  if (project?.code) return `${project.code}-${t.projectNumber}`
  return `#${t.number}`
}

export function TicketsBoard({
  projects,
  initialTickets,
}: {
  projects: Project[]
  initialTickets: Ticket[]
}) {
  const [projectFilter, setProjectFilter] = useState(TODOS)
  const [typeFilter, setTypeFilter] = useState(TODOS)
  const [statusFilter, setStatusFilter] = useState(TODOS)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('number_desc')

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  const tickets = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = initialTickets.filter((t) => {
      if (projectFilter !== TODOS && t.projectId !== projectFilter) return false
      if (typeFilter !== TODOS && t.type !== typeFilter) return false
      if (statusFilter !== TODOS && t.status !== statusFilter) return false
      if (q && !t.title.toLowerCase().includes(q) && !(t.description ?? '').toLowerCase().includes(q)) {
        return false
      }
      return true
    })

    const sorted = [...filtered]
    switch (sort) {
      case 'number_asc':
        sorted.sort((a, b) => a.number - b.number)
        break
      case 'priority_desc':
        sorted.sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] || b.number - a.number)
        break
      case 'priority_asc':
        sorted.sort((a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] || b.number - a.number)
        break
      default:
        sorted.sort((a, b) => b.number - a.number)
    }
    return sorted
  }, [initialTickets, projectFilter, typeFilter, statusFilter, search, sort])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Tickets</h1>
          <p className="text-sm text-muted-foreground">
            Bugs, cambios, mejoras y nuevos desarrollos de todos los proyectos.
          </p>
        </div>
        <NuevoTicketDialog projects={projects} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por título o descripción..."
          className="w-full sm:w-64"
        />

        <Select value={projectFilter} onValueChange={(v) => v && setProjectFilter(v)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Proyecto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los proyectos</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={(v) => v && setTypeFilter(v)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los tipos</SelectItem>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los estados</SelectItem>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => v && setSort(v as SortKey)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Ordenar por" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Título</TableHead>
            <TableHead>Proyecto</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Prioridad</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Asignado a</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                No hay tickets con estos filtros.
              </TableCell>
            </TableRow>
          )}
          {tickets.map((t) => {
            const project = projectById.get(t.projectId)
            return (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-muted-foreground">
                  <Link href={`/tickets/${t.id}`} className="hover:underline hover:text-foreground">
                    {ticketCode(t, project)}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-normal font-medium">
                  <Link href={`/tickets/${t.id}`} className="hover:underline">
                    {t.title}
                  </Link>
                </TableCell>
                <TableCell>{project?.name ?? '—'}</TableCell>
                <TableCell>{TYPE_LABELS[t.type]}</TableCell>
                <TableCell>
                  <Badge variant={PRIORITY_BADGE[t.priority]}>{PRIORITY_LABELS[t.priority]}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[t.status]}>{STATUS_LABELS[t.status]}</Badge>
                </TableCell>
                <TableCell>{t.assignedTo ?? '—'}</TableCell>
                <TableCell>
                  <TicketActions ticket={t} projects={projects} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
