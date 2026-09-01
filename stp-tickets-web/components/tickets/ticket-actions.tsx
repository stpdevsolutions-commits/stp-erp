'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { MoreHorizontal, Pencil, Trash2, ExternalLink } from 'lucide-react'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Project, Ticket } from '@/lib/types'
import { updateTicket, deleteTicket } from '@/lib/actions/tickets'
import { TYPE_LABELS, STATUS_LABELS, PRIORITY_LABELS } from './labels'

const editSchema = z.object({
  projectId: z.string().min(1, 'Selecciona un proyecto'),
  title: z.string().min(2, 'Mínimo 2 caracteres').max(200),
  description: z.string().optional(),
  type: z.enum(['bug', 'mejora', 'cambio', 'desarrollo']),
  status: z.enum(['pending', 'in_progress', 'review', 'done', 'cancelled']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  assignedTo: z.string().optional(),
})

type EditFormValues = z.infer<typeof editSchema>

function EditDialog({
  ticket,
  projects,
  open,
  onOpenChange,
}: {
  ticket: Ticket
  projects: Project[]
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      projectId: ticket.projectId,
      title: ticket.title,
      description: ticket.description ?? '',
      type: ticket.type,
      status: ticket.status,
      priority: ticket.priority,
      assignedTo: ticket.assignedTo ?? '',
    },
  })

  function handleClose() {
    setServerError(null)
    onOpenChange(false)
  }

  async function onSubmit(data: EditFormValues) {
    setServerError(null)
    const result = await updateTicket(ticket.id, {
      projectId: data.projectId,
      title: data.title,
      description: data.description || null,
      type: data.type,
      status: data.status,
      priority: data.priority,
      assignedTo: data.assignedTo || null,
    })
    if (!result.ok) {
      setServerError(result.error ?? 'Error desconocido')
      return
    }
    handleClose()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar ticket</DialogTitle>
          <DialogDescription>Actualiza el estado o los datos del ticket.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-title">
              Título <span className="text-destructive">*</span>
            </Label>
            <Input id="edit-title" {...register('title')} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Proyecto</Label>
            <Select value={watch('projectId')} onValueChange={(v) => v && setValue('projectId', v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={watch('type')}
                onValueChange={(v) => v && setValue('type', v as EditFormValues['type'])}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select
                value={watch('status')}
                onValueChange={(v) => v && setValue('status', v as EditFormValues['status'])}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Prioridad</Label>
              <Select
                value={watch('priority')}
                onValueChange={(v) => v && setValue('priority', v as EditFormValues['priority'])}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-assignedTo">Asignado a</Label>
            <Input id="edit-assignedTo" placeholder="Opcional" {...register('assignedTo')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-description">Descripción</Label>
            <textarea
              id="edit-description"
              {...register('description')}
              rows={4}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            />
          </div>

          {serverError && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
              {serverError}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeleteDialog({
  ticket,
  open,
  onOpenChange,
}: {
  ticket: Ticket
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    setError(null)
    const result = await deleteTicket(ticket.id)
    setLoading(false)
    if (!result.ok) {
      setError(result.error ?? 'Error al eliminar')
      return
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Eliminar ticket</DialogTitle>
          <DialogDescription>
            ¿Estás seguro de que deseas eliminar{' '}
            <span className="font-semibold text-foreground">{ticket.title}</span>? Esta acción no
            se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">{error}</p>
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

export function TicketActions({ ticket, projects }: { ticket: Ticket; projects: Project[] }) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
          <MoreHorizontal className="size-4" />
          <span className="sr-only">Acciones</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<Link href={`/tickets/${ticket.id}`} />}>
            <ExternalLink className="size-4" />
            Ver detalle
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-4" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditDialog ticket={ticket} projects={projects} open={editOpen} onOpenChange={setEditOpen} />
      <DeleteDialog ticket={ticket} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  )
}
