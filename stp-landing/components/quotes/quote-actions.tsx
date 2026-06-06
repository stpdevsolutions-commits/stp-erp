'use client'

import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MoreHorizontal, Pencil, Trash2, Plus } from 'lucide-react'
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
import type { Project, Quote } from '@/lib/types'
import { updateQuote, deleteQuote } from '@/lib/actions/quotes'

// ── Schema ────────────────────────────────────────────────────────────────────

const itemSchema = z.object({
  description: z.string().min(1, 'Requerido'),
  quantity: z
    .string()
    .min(1, 'Requerido')
    .refine((v) => parseFloat(v) > 0, 'Debe ser > 0'),
  unitPrice: z
    .string()
    .min(1, 'Requerido')
    .refine((v) => parseFloat(v) >= 0, 'Debe ser ≥ 0'),
})

const editSchema = z.object({
  title: z.string().min(2, 'Mínimo 2 caracteres').max(200),
  projectId: z.string().min(1, 'Selecciona un proyecto'),
  status: z.enum(['draft', 'sent', 'approved', 'rejected', 'expired']),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, 'Agrega al menos un ítem'),
})

type EditFormValues = z.infer<typeof editSchema>

const STATUS_LABELS = {
  draft: 'Borrador',
  sent: 'Enviada',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  expired: 'Expirada',
}

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })
const ITBIS_RATE = 0.18

// ── Edit dialog ───────────────────────────────────────────────────────────────

function EditDialog({
  cotizacion,
  projects,
  open,
  onOpenChange,
}: {
  cotizacion: Quote
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
    control,
    formState: { errors, isSubmitting },
  } = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      title: cotizacion.title,
      projectId: cotizacion.projectId,
      status: cotizacion.status,
      validUntil: cotizacion.validUntil ? cotizacion.validUntil.slice(0, 10) : '',
      notes: cotizacion.notes ?? '',
      items: cotizacion.items.length > 0
        ? cotizacion.items.map((item) => ({
            description: item.description,
            quantity: String(item.quantity),
            unitPrice: String(item.unitPrice),
          }))
        : [{ description: '', quantity: '1', unitPrice: '' }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  const watchedItems = watch('items')
  const subtotal = watchedItems.reduce((sum, item) => {
    return sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)
  }, 0)
  const itbis = subtotal * ITBIS_RATE
  const total = subtotal + itbis

  const projectId = watch('projectId')
  const selectedProjectName = projects.find((p) => p.id === projectId)?.name

  function handleClose() {
    setServerError(null)
    onOpenChange(false)
  }

  async function onSubmit(data: EditFormValues) {
    setServerError(null)
    const project = projects.find((p) => p.id === data.projectId)
    const result = await updateQuote(cotizacion.id, {
      title: data.title,
      projectId: data.projectId,
      clientId: project?.clientId ?? cotizacion.clientId,
      status: data.status,
      validUntil: data.validUntil || null,
      notes: data.notes || null,
      items: data.items.map((item) => ({
        description: item.description,
        quantity: parseFloat(item.quantity),
        unitPrice: parseFloat(item.unitPrice),
      })),
    })
    if (!result.ok) {
      setServerError(result.error ?? 'Error desconocido')
      return
    }
    handleClose()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar cotización</DialogTitle>
          <DialogDescription>
            {cotizacion.number} — {cotizacion.title}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="edit-title">
                Título <span className="text-destructive">*</span>
              </Label>
              <Input id="edit-title" {...register('title')} />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>
                Proyecto <span className="text-destructive">*</span>
              </Label>
              <Select
                value={watch('projectId')}
                onValueChange={(v) => v && setValue('projectId', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar proyecto">
                    {selectedProjectName}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.projectId && (
                <p className="text-xs text-destructive">{errors.projectId.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select
                value={watch('status')}
                onValueChange={(v) => v && setValue('status', v as EditFormValues['status'])}
              >
                <SelectTrigger>
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
              <Label htmlFor="edit-validUntil">Válida hasta</Label>
              <Input id="edit-validUntil" type="date" {...register('validUntil')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-notes">Notas</Label>
              <Input id="edit-notes" {...register('notes')} />
            </div>
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Ítems</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ description: '', quantity: '1', unitPrice: '' })}
              >
                <Plus className="size-3.5 mr-1" />
                Agregar ítem
              </Button>
            </div>

            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Descripción</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground w-20">Cant.</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground w-32">Precio unit.</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground w-32">Subtotal</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {fields.map((field, index) => {
                    const qty = parseFloat(watchedItems[index]?.quantity) || 0
                    const price = parseFloat(watchedItems[index]?.unitPrice) || 0
                    const rowSubtotal = qty * price

                    return (
                      <tr key={field.id}>
                        <td className="px-3 py-2">
                          <Input
                            className="h-8 border-0 shadow-none focus-visible:ring-0 px-0"
                            {...register(`items.${index}.description`)}
                          />
                          {errors.items?.[index]?.description && (
                            <p className="text-xs text-destructive">
                              {errors.items[index].description?.message}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min="0.01"
                            step="0.01"
                            className="h-8 border-0 shadow-none focus-visible:ring-0 px-0 text-right"
                            {...register(`items.${index}.quantity`)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="h-8 border-0 shadow-none focus-visible:ring-0 px-0 text-right"
                            {...register(`items.${index}.unitPrice`)}
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {DOP.format(rowSubtotal)}
                        </td>
                        <td className="px-2 py-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => remove(index)}
                            disabled={fields.length === 1}
                          >
                            <Trash2 className="size-3.5 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <div className="w-64 space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{DOP.format(subtotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>ITBIS (18%)</span>
                  <span className="tabular-nums">{DOP.format(itbis)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t pt-1">
                  <span>Total</span>
                  <span className="tabular-nums">{DOP.format(total)}</span>
                </div>
              </div>
            </div>
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

// ── Delete dialog ─────────────────────────────────────────────────────────────

function DeleteDialog({
  cotizacion,
  open,
  onOpenChange,
}: {
  cotizacion: Quote
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    setError(null)
    const result = await deleteQuote(cotizacion.id)
    setLoading(false)
    if (!result.ok) {
      setError(result.error ?? 'Error al eliminar')
      return
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Eliminar cotización</DialogTitle>
          <DialogDescription>
            ¿Estás seguro de que deseas eliminar{' '}
            <span className="font-semibold text-foreground">{cotizacion.number}</span>? Esta acción
            no se puede deshacer.
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

// ── Row actions ───────────────────────────────────────────────────────────────

export function QuoteActions({
  cotizacion,
  projects,
}: {
  cotizacion: Quote
  projects: Project[]
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const isLocked = cotizacion.status === 'approved'

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
          <MoreHorizontal className="size-4" />
          <span className="sr-only">Acciones</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => !isLocked && setEditOpen(true)}
            disabled={isLocked}
          >
            <Pencil className="size-4" />
            {isLocked ? 'Aprobada (bloqueada)' : 'Editar'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-4" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {!isLocked && (
        <EditDialog
          cotizacion={cotizacion}
          projects={projects}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
      <DeleteDialog cotizacion={cotizacion} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  )
}
