﻿'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MoreHorizontal, Pencil, Trash2, FileText, Printer } from 'lucide-react'
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
import type { Payment, Client, Project } from '@/lib/types'
import { updatePayment, deletePayment } from '@/lib/actions/payments'

const METHOD_LABELS = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  check: 'Cheque',
  card: 'Tarjeta',
  other: 'Otro',
}

const STATUS_LABELS = {
  pending: 'Pendiente',
  completed: 'Completado',
  failed: 'Fallido',
  refunded: 'Reembolsado',
}

const editSchema = z.object({
  clientId: z.string().min(1, 'Selecciona un cliente'),
  projectId: z.string().optional(),
  description: z.string().min(2, 'Mínimo 2 caracteres'),
  amount: z.string().min(1, 'Requerido').refine((v) => parseFloat(v) > 0, 'Debe ser > 0'),
  method: z.enum(['cash', 'transfer', 'check', 'card', 'other']),
  status: z.enum(['pending', 'completed', 'failed', 'refunded']),
  date: z.string().min(1, 'Requerido'),
  reference: z.string().optional(),
  notes: z.string().optional(),
})

type EditFormValues = z.infer<typeof editSchema>

function EditDialog({
  pago,
  clients,
  projects,
  open,
  onOpenChange,
}: {
  pago: Payment
  clients: Client[]
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
      clientId: pago.clientId,
      projectId: pago.projectId ?? '',
      description: pago.description,
      amount: String(pago.amount),
      method: pago.method,
      status: pago.status,
      date: pago.date.slice(0, 10),
      reference: pago.reference ?? '',
      notes: pago.notes ?? '',
    },
  })

  const clientId = watch('clientId')
  const selectedClientName = clients.find((c) => c.id === clientId)?.name
  const projectId = watch('projectId')
  const selectedProjectName = projects.find((p) => p.id === projectId)?.name
  const clientProjects = clientId ? projects.filter((p) => p.clientId === clientId) : projects

  function handleClose() {
    setServerError(null)
    onOpenChange(false)
  }

  async function onSubmit(data: EditFormValues) {
    setServerError(null)
    const result = await updatePayment(pago.id, {
      clientId: data.clientId,
      projectId: data.projectId || null,
      description: data.description,
      amount: parseFloat(data.amount),
      method: data.method,
      status: data.status,
      date: data.date,
      reference: data.reference || null,
      notes: data.notes || null,
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
          <DialogTitle>Editar pago</DialogTitle>
          <DialogDescription>{pago.description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-full space-y-1.5">
              <Label>Cliente <span className="text-destructive">*</span></Label>
              <Select
                value={watch('clientId') ?? ''}
                onValueChange={(v) => {
                  if (!v) return
                  setValue('clientId', v)
                  setValue('projectId', '')
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar cliente">
                    {selectedClientName}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.clientId && <p className="text-xs text-destructive">{errors.clientId.message}</p>}
            </div>

            <div className="col-span-full space-y-1.5">
              <Label>Proyecto</Label>
              <Select
                value={watch('projectId') ?? ''}
                onValueChange={(v) => setValue('projectId', v ?? '')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="— Ninguno —">
                    {projectId ? selectedProjectName : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Ninguno —</SelectItem>
                  {clientProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-full space-y-1.5">
              <Label htmlFor="ep-description">Descripción <span className="text-destructive">*</span></Label>
              <Input id="ep-description" {...register('description')} />
              {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ep-amount">Monto (RD$) <span className="text-destructive">*</span></Label>
              <Input id="ep-amount" type="number" min="0.01" step="0.01" {...register('amount')} />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ep-date">Fecha <span className="text-destructive">*</span></Label>
              <Input id="ep-date" type="date" {...register('date')} />
            </div>

            <div className="space-y-1.5">
              <Label>Método</Label>
              <Select
                value={watch('method')}
                onValueChange={(v) => v && setValue('method', v as EditFormValues['method'])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(METHOD_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
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
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-full space-y-1.5">
              <Label htmlFor="ep-reference">Referencia</Label>
              <Input id="ep-reference" {...register('reference')} />
            </div>

            <div className="col-span-full space-y-1.5">
              <Label htmlFor="ep-notes">Notas</Label>
              <Input id="ep-notes" {...register('notes')} />
            </div>
          </div>

          {serverError && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">{serverError}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
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
  pago,
  open,
  onOpenChange,
}: {
  pago: Payment
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    setError(null)
    const result = await deletePayment(pago.id)
    setLoading(false)
    if (!result.ok) { setError(result.error ?? 'Error al eliminar'); return }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Eliminar pago</DialogTitle>
          <DialogDescription>
            ¿Eliminar <span className="font-semibold text-foreground">{pago.description}</span>? Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function PagoActions({
  pago,
  clients,
  projects,
}: {
  pago: Payment
  clients: Client[]
  projects: Project[]
}) {
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
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem
            render={<a href={`/api/files/payment/${pago.id}`} target="_blank" rel="noopener noreferrer" />}
          >
            <FileText className="size-4" />
            Ver PDF
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              const win = window.open(`/api/files/payment/${pago.id}`, '_blank')
              if (win) win.addEventListener('load', () => setTimeout(() => win.print(), 400))
            }}
          >
            <Printer className="size-4" />
            Imprimir
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-4" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <EditDialog pago={pago} clients={clients} projects={projects} open={editOpen} onOpenChange={setEditOpen} />
      <DeleteDialog pago={pago} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  )
}
