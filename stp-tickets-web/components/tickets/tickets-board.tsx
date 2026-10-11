'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Project, Ticket, TicketStatus } from '@/lib/types'
import { ticketCode } from '@/lib/ticket-code'
import { TableEmpty } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
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

const FILTERS_KEY = 'stp-tickets:filters:v1'

type PersistedFilters = {
  projectFilter: string
  typeFilter: string
  statusFilters: TicketStatus[]
  search: string
  sort: SortKey
}

const DEFAULT_FILTERS: PersistedFilters = {
  projectFilter: TODOS,
  typeFilter: TODOS,
  statusFilters: [],
  search: '',
  sort: 'number_desc',
}

/** Lee los filtros guardados en localStorage. Devuelve los defaults si no hay
 * nada, si el JSON está corrupto o si corremos en el server (SSR). */
function loadFilters(): PersistedFilters {
  if (typeof window === 'undefined') return DEFAULT_FILTERS
  try {
    const raw = window.localStorage.getItem(FILTERS_KEY)
    if (!raw) return DEFAULT_FILTERS
    return { ...DEFAULT_FILTERS, ...(JSON.parse(raw) as Partial<PersistedFilters>) }
  } catch {
    return DEFAULT_FILTERS
  }
}

export function TicketsBoard({
  projects,
  initialTickets,
  urlFilters,
}: {
  projects: Project[]
  initialTickets: Ticket[]
  urlFilters?: { project?: string; status?: string; sort?: string; all?: string }
}) {
  const [projectFilter, setProjectFilter] = useState(TODOS)
  const [typeFilter, setTypeFilter] = useState(TODOS)
  // Array vacío = sin filtro (todos los estados) — a diferencia de
  // proyecto/tipo, acá sí queremos poder marcar varios a la vez (p.ej.
  // "pendiente" + "en progreso" para ver todo lo abierto de un vistazo).
  const [statusFilters, setStatusFilters] = useState<TicketStatus[]>([])
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('number_desc')
  // Los filtros persisten en localStorage y se recuperan al reabrir la página,
  // aunque se haya cerrado el navegador (TIX-8). La carga va en un effect y no
  // en el init de useState: el HTML del server siempre trae los defaults, así
  // que inicializar distinto en el cliente daría un mismatch de hidratación.
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const fromUrl = !!(urlFilters?.project || urlFilters?.status || urlFilters?.sort || urlFilters?.all)
    const saved = fromUrl ? DEFAULT_FILTERS : loadFilters()
    const validStatuses = (urlFilters?.status ?? '')
      .split(',')
      .filter((v): v is TicketStatus => v in STATUS_LABELS)
    const urlProject = urlFilters?.project && projects.some((p) => p.id === urlFilters.project) ? urlFilters.project : null
    const urlSort = urlFilters?.sort && urlFilters.sort in SORT_LABELS ? (urlFilters.sort as SortKey) : null
    // Un proyecto guardado que ya no existe (borrado) dejaría el Select en
    // blanco y ocultaría todo — si no está en la lista, se vuelve a "todos".
    setProjectFilter(urlProject ?? (projects.some((p) => p.id === saved.projectFilter) ? saved.projectFilter : TODOS))
    setTypeFilter(saved.typeFilter)
    setStatusFilters(fromUrl ? validStatuses : saved.statusFilters)
    setSearch(saved.search)
    setSort(urlSort ?? saved.sort)
    setHydrated(true)
    /* eslint-enable react-hooks/set-state-in-effect */
    // Solo al montar: los filtros guardados se aplican una vez y de ahí en
    // adelante manda el estado en memoria.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(
        FILTERS_KEY,
        JSON.stringify({ projectFilter, typeFilter, statusFilters, search, sort }),
      )
    } catch {
      /* localStorage lleno o bloqueado — los filtros solo no persisten */
    }
  }, [hydrated, projectFilter, typeFilter, statusFilters, search, sort])

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  const tickets = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = initialTickets.filter((t) => {
      if (projectFilter !== TODOS && t.projectId !== projectFilter) return false
      if (typeFilter !== TODOS && t.type !== typeFilter) return false
      if (statusFilters.length > 0 && !statusFilters.includes(t.status)) return false
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
  }, [initialTickets, projectFilter, typeFilter, statusFilters, search, sort])

  function toggleStatus(status: TicketStatus, checked: boolean) {
    setStatusFilters((prev) => (checked ? [...prev, status] : prev.filter((s) => s !== status)))
  }

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

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
        <StatCard label="Pendientes"><div className="text-2xl font-bold">{tickets.filter((t) => t.status === 'pending').length}</div></StatCard>
        <StatCard label="En curso"><div className="text-2xl font-bold">{tickets.filter((t) => t.status === 'in_progress').length}</div></StatCard>
        <StatCard label="En revisión"><div className="text-2xl font-bold">{tickets.filter((t) => t.status === 'review').length}</div></StatCard>
        <StatCard label="Resueltos"><div className="text-2xl font-bold text-green-700 dark:text-green-400">{tickets.filter((t) => t.status === 'done').length}</div></StatCard>
      </div>

      <div className="flex flex-wrap gap-2 max-sm:[&>*]:w-full max-sm:[&_[data-slot=select-trigger]]:w-full max-sm:[&_input]:w-full max-sm:[&_button]:w-full">
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

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" className="h-8 w-40 justify-between font-normal" />
            }
          >
            <span className={statusFilters.length === 0 ? 'text-muted-foreground' : ''}>
              {statusFilters.length === 0
                ? 'Todos los estados'
                : statusFilters.length === 1
                  ? STATUS_LABELS[statusFilters[0]]
                  : `${statusFilters.length} estados`}
            </span>
            <ChevronDown className="size-4 opacity-50" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <DropdownMenuCheckboxItem
                key={value}
                checked={statusFilters.includes(value as TicketStatus)}
                onCheckedChange={(checked) => toggleStatus(value as TicketStatus, checked)}
              >
                {label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

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
            <TableHead className="hidden md:table-cell">Proyecto</TableHead>
            <TableHead className="hidden lg:table-cell">Tipo</TableHead>
            <TableHead className="hidden sm:table-cell">Prioridad</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="hidden xl:table-cell">Asignado a</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.length === 0 && (
            <TableEmpty
              colSpan={8}
              filtered={initialTickets.length > 0}
              title={initialTickets.length > 0 ? 'No hay tickets con estos filtros' : 'Aún no hay tickets'}
              hint={initialTickets.length > 0 ? undefined : 'Reporta el primero con el botón «Nuevo ticket».'}
              action={initialTickets.length > 0 ? undefined : <NuevoTicketDialog projects={projects} />}
            />
          )}
          {tickets.map((t) => {
            const project = t.projectId ? projectById.get(t.projectId) : undefined
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
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground md:hidden">
                    {[project?.name, TYPE_LABELS[t.type], PRIORITY_LABELS[t.priority]].filter(Boolean).join(' · ')}
                  </span>
                </TableCell>
                <TableCell className="hidden md:table-cell">{project?.name ?? '—'}</TableCell>
                <TableCell className="hidden lg:table-cell">{TYPE_LABELS[t.type]}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant={PRIORITY_BADGE[t.priority]}>{PRIORITY_LABELS[t.priority]}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[t.status]}>{STATUS_LABELS[t.status]}</Badge>
                </TableCell>
                <TableCell className="hidden xl:table-cell">{t.assignedTo ?? '—'}</TableCell>
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
