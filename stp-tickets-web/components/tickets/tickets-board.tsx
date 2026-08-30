'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
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
import { TYPE_LABELS, STATUS_LABELS, PRIORITY_LABELS, PRIORITY_BADGE, STATUS_BADGE } from './labels'

const TODOS = '__todos__'

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

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  const tickets = useMemo(() => {
    return initialTickets.filter((t) => {
      if (projectFilter !== TODOS && t.projectId !== projectFilter) return false
      if (typeFilter !== TODOS && t.type !== typeFilter) return false
      if (statusFilter !== TODOS && t.status !== statusFilter) return false
      return true
    })
  }, [initialTickets, projectFilter, typeFilter, statusFilter])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Tickets</h1>
          <p className="text-sm text-muted-foreground">
            Bugs, cambios y mejoras de todos los proyectos.
          </p>
        </div>
        <NuevoTicketDialog projects={projects} />
      </div>

      <div className="flex flex-wrap gap-2">
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
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>N°</TableHead>
            <TableHead>Título</TableHead>
            <TableHead>Proyecto</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Prioridad</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Reportado por</TableHead>
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
          {tickets.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="font-mono text-muted-foreground">#{t.number}</TableCell>
              <TableCell className="whitespace-normal font-medium">{t.title}</TableCell>
              <TableCell>{projectById.get(t.projectId)?.name ?? '—'}</TableCell>
              <TableCell>{TYPE_LABELS[t.type]}</TableCell>
              <TableCell>
                <Badge variant={PRIORITY_BADGE[t.priority]}>{PRIORITY_LABELS[t.priority]}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_BADGE[t.status]}>{STATUS_LABELS[t.status]}</Badge>
              </TableCell>
              <TableCell>{t.reportedBy}</TableCell>
              <TableCell>
                <TicketActions ticket={t} projects={projects} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
