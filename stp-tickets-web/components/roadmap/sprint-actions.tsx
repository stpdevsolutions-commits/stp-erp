'use client'

import { useState, useTransition } from 'react'
import { MoreHorizontal, Pencil, Trash2, ListChecks, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Project, Sprint, SprintStatus, Ticket } from '@/lib/types'
import { deleteSprint, updateSprint } from '@/lib/actions/sprints'
import { EtapaDialog } from './etapa-dialog'
import { SprintTicketsDialog } from './sprint-tickets-dialog'
import { SPRINT_STATUS_LABELS } from './labels'

const STATUSES: SprintStatus[] = ['planned', 'active', 'done', 'cancelled']

function DeleteDialog({
  sprint,
  open,
  onOpenChange,
}: {
  sprint: Sprint
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    setError(null)
    const res = await deleteSprint(sprint.id)
    setLoading(false)
    if (!res.ok) {
      setError(res.error ?? 'Error al eliminar')
      return
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Eliminar etapa</DialogTitle>
          <DialogDescription>
            Se elimina{' '}
            <span className="font-semibold text-foreground">{sprint.name}</span>. Los{' '}
            {sprint.stats.total} tickets no se borran: solo dejan de estar agrupados en esta
            etapa.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function SprintActions({
  sprint,
  projects,
  allTickets,
}: {
  sprint: Sprint
  projects: Project[]
  allTickets: Ticket[]
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [ticketsOpen, setTicketsOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function changeStatus(status: SprintStatus) {
    if (status === sprint.status) return
    startTransition(async () => {
      await updateSprint(sprint.id, { status })
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" disabled={pending} />}>
          <MoreHorizontal className="size-4" />
          <span className="sr-only">Acciones de la etapa</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setTicketsOpen(true)}>
            <ListChecks className="size-4" />
            Gestionar tickets
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Cambiar estado</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {STATUSES.map((s) => (
                <DropdownMenuItem key={s} onClick={() => changeStatus(s)}>
                  <Check
                    className={`size-4 ${s === sprint.status ? 'opacity-100' : 'opacity-0'}`}
                  />
                  {SPRINT_STATUS_LABELS[s]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-4" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EtapaDialog projects={projects} sprint={sprint} open={editOpen} onOpenChange={setEditOpen} />
      <SprintTicketsDialog
        sprint={sprint}
        allTickets={allTickets}
        open={ticketsOpen}
        onOpenChange={setTicketsOpen}
      />
      <DeleteDialog sprint={sprint} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  )
}
