﻿'use client'

import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MoreHorizontal, Pencil, Trash2, Plus, Printer } from 'lucide-react'
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
import type { Client, Project, Quote } from '@/lib/types'
import { updateQuote, deleteQuote } from '@/lib/actions/quotes'

// ── Schema ────────────────────────────────────────────────────────────────────

const UNITS = [
  { value: 'unid', label: 'Unid.' },
  { value: 'm', label: 'm (Metro)' },
  { value: 'm2', label: 'm² (M. cuadrado)' },
  { value: 'm3', label: 'm³ (M. cúbico)' },
  { value: 'kg', label: 'kg (Kilogramo)' },
  { value: 'lb', label: 'lb (Libra)' },
  { value: 'hr', label: 'hr (Hora)' },
  { value: 'dia', label: 'día' },
  { value: 'pie', label: 'pie' },
  { value: 'pulg', label: 'pulg. (Pulgada)' },
  { value: 'gl', label: 'gl (Galón)' },
  { value: 'lt', label: 'lt (Litro)' },
  { value: 'rollo', label: 'rollo' },
  { value: 'caja', label: 'caja' },
  { value: 'juego', label: 'juego' },
  { value: 'servicio', label: 'servicio' },
  { value: 'otro', label: 'otro' },
]

const itemSchema = z.object({
  description: z.string().min(1, 'Requerido'),
  unit: z.string().optional(),
  quantity: z
    .string()
    .min(1, 'Requerido')
    .refine((v) => parseFloat(v) > 0, 'Debe ser > 0'),
  unitPrice: z
    .string()
    .min(1, 'Requerido')
    .refine((v) => parseFloat(v) >= 0, 'Debe ser ≥ 0'),
  discountPct: z
    .string()
    .optional()
    .refine((v) => !v || (parseFloat(v) >= 0 && parseFloat(v) <= 100), 'Entre 0 y 100'),
})

const editSchema = z.object({
  title: z.string().min(2, 'Mínimo 2 caracteres').max(200),
  clientId: z.string().min(1, 'Selecciona un cliente'),
  projectId: z.string().optional(),
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

// ── Edit dialog ───────────────────────────────────────────────────────────────

function EditDialog({
  cotizacion,
  clients,
  projects,
  open,
  onOpenChange,
}: {
  cotizacion: Quote
  clients: Client[]
  projects: Project[]
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [applyITBIS, setApplyITBIS] = useState(cotizacion.taxRate !== 0)

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
      clientId: cotizacion.clientId,
      projectId: cotizacion.projectId ?? undefined,
      status: cotizacion.status,
      validUntil: cotizacion.validUntil ? cotizacion.validUntil.slice(0, 10) : '',
      notes: cotizacion.notes ?? '',
      items: (cotizacion.items ?? []).length > 0
        ? cotizacion.items.map((item) => ({
            description: item.description,
            unit: item.unit ?? '',
            quantity: String(item.quantity),
            unitPrice: String(item.unitPrice),
            discountPct: item.discountPct ? String(item.discountPct) : '',
          }))
        : [{ description: '', unit: '', quantity: '1', unitPrice: '', discountPct: '' }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  const watchedItems = watch('items')
  const clientId = watch('clientId')
  const projectId = watch('projectId')

  const subtotal = watchedItems.reduce((sum, item) => {
    const qty = parseFloat(item.quantity) || 0
    const price = parseFloat(item.unitPrice) || 0
    const disc = parseFloat(item.discountPct || '0') || 0
    return sum + qty * price * (1 - disc / 100)
  }, 0)
  const itbis = applyITBIS ? subtotal * 0.18 : 0
  const total = subtotal + itbis

  const filteredProjects = projects.filter((p) => p.clientId === clientId)
  const selectedClient = clients.find((c) => c.id === clientId)
  const selectedProject = filteredProjects.find((p) => p.id === projectId)

  function handleClientChange(newClientId: string | null) {
    if (!newClientId) return
    setValue('clientId', newClientId)
    setValue('projectId', undefined)
  }

  function handleProjectChange(newProjectId: string | null) {
    if (!newProjectId || newProjectId === '__none__') {
      setValue('projectId', undefined)
    } else {
      setValue('projectId', newProjectId)
    }
  }

  function handleClose() {
    setServerError(null)
    onOpenChange(false)
  }

  async function onSubmit(data: EditFormValues) {
    setServerError(null)
    const result = await updateQuote(cotizacion.id, {
      title: data.title,
      clientId: data.clientId,
      projectId: data.projectId ?? null,
      status: data.status,
      validUntil: data.validUntil || null,
      notes: data.notes || null,
      taxRate: applyITBIS ? 18 : 0,
      items: data.items.map((item) => ({
        description: item.description,
        unit: item.unit || undefined,
        quantity: parseFloat(item.quantity),
        unitPrice: parseFloat(item.unitPrice),
        discountPct: parseFloat(item.discountPct || '0') || 0,
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
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar cotización</DialogTitle>
          <DialogDescription>
            {cotizacion.number} — {cotizacion.title}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-full space-y-1.5">
              <Label htmlFor="edit-title">
                Título <span className="text-destructive">*</span>
              </Label>
              <Input id="edit-title" {...register('title')} />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>

            {/* Client selector */}
            <div className="space-y-1.5">
              <Label>
                Cliente <span className="text-destructive">*</span>
              </Label>
              <Select value={clientId ?? ''} onValueChange={handleClientChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar cliente">
                    {selectedClient?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.clientId && (
                <p className="text-xs text-destructive">{errors.clientId.message}</p>
              )}
            </div>

            {/* Project selector (optional) */}
            <div className="space-y-1.5">
              <Label>Proyecto (opcional)</Label>
              <Select
                value={projectId ?? '__none__'}
                onValueChange={handleProjectChange}
                disabled={!clientId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin proyecto">
                    {selectedProject ? `${selectedProject.code} — ${selectedProject.name}` : 'Sin proyecto'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sin proyecto —</SelectItem>
                  {filteredProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.code} — {p.name}
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

            <div className="col-span-full space-y-1.5">
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
                onClick={() => append({ description: '', unit: '', quantity: '1', unitPrice: '', discountPct: '' })}
              >
                <Plus className="size-3.5 mr-1" />
                Agregar ítem
              </Button>
            </div>

            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm min-w-[680px]">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Descripción</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground w-28">Unidad</th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground w-18">Cant.</th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground w-28">Precio unit.</th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground w-18">Desc. %</th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground w-28">Total</th>
                    <th className="w-9" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {fields.map((field, index) => {
                    const qty = parseFloat(watchedItems[index]?.quantity) || 0
                    const price = parseFloat(watchedItems[index]?.unitPrice) || 0
                    const disc = parseFloat(watchedItems[index]?.discountPct || '0') || 0
                    const rowTotal = qty * price * (1 - disc / 100)
                    const unitVal = watchedItems[index]?.unit || ''

                    return (
                      <tr key={field.id}>
                        <td className="px-3 py-1.5">
                          <Input
                            className="h-8 border-0 shadow-none focus-visible:ring-0 px-0 text-sm"
                            {...register(`items.${index}.description`)}
                          />
                          {errors.items?.[index]?.description && (
                            <p className="text-xs text-destructive">
                              {errors.items[index].description?.message}
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <Select
                            value={unitVal || '__none__'}
                            onValueChange={(v) => {
                              if (!v) return
                              setValue(`items.${index}.unit`, v === '__none__' ? '' : v)
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs border-0 shadow-none focus:ring-0 px-0">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">—</SelectItem>
                              {UNITS.map((u) => (
                                <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            min="0.01"
                            step="0.01"
                            className="h-8 border-0 shadow-none focus-visible:ring-0 px-0 text-right text-sm"
                            {...register(`items.${index}.quantity`)}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="h-8 border-0 shadow-none focus-visible:ring-0 px-0 text-right text-sm"
                            {...register(`items.${index}.unitPrice`)}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            className="h-8 border-0 shadow-none focus-visible:ring-0 px-0 text-right text-sm"
                            placeholder="0"
                            {...register(`items.${index}.discountPct`)}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {DOP.format(rowTotal)}
                        </td>
                        <td className="px-1 py-1.5">
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

            <div className="flex items-end justify-between">
              {/* ITBIS toggle */}
              <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
                <input
                  type="checkbox"
                  checked={applyITBIS}
                  onChange={(e) => setApplyITBIS(e.target.checked)}
                  className="rounded border-input"
                />
                Aplicar ITBIS (18%)
              </label>

              <div className="w-64 space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{DOP.format(subtotal)}</span>
                </div>
                {applyITBIS && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>ITBIS (18%)</span>
                    <span className="tabular-nums">{DOP.format(itbis)}</span>
                  </div>
                )}
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

// ── Print dialog ──────────────────────────────────────────────────────────────

function PrintDialog({
  cotizacion,
  open,
  onOpenChange,
}: {
  cotizacion: Quote
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const DOP_FMT = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vista de impresión</DialogTitle>
          <DialogDescription>{cotizacion.number}</DialogDescription>
        </DialogHeader>

        {/* Printable area */}
        <div id="quote-print" className="space-y-5 text-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xl font-bold">Cotización</p>
              <p className="font-mono text-muted-foreground">{cotizacion.number}</p>
            </div>
            <div className="text-right text-muted-foreground space-y-0.5">
              {cotizacion.validUntil && (
                <p>Válida hasta: {new Date(cotizacion.validUntil).toLocaleDateString('es-DO')}</p>
              )}
              <p>Fecha: {new Date(cotizacion.createdAt).toLocaleDateString('es-DO')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="font-semibold mb-1">Cliente</p>
              <p>{cotizacion.client?.name ?? '—'}</p>
              {cotizacion.client?.email && (
                <p className="text-muted-foreground">{cotizacion.client.email}</p>
              )}
            </div>
            {cotizacion.project && (
              <div>
                <p className="font-semibold mb-1">Proyecto</p>
                <p className="font-mono text-xs text-muted-foreground">{cotizacion.project.code}</p>
                <p>{cotizacion.project.name}</p>
              </div>
            )}
          </div>

          <div>
            <p className="font-semibold text-base mb-2">{cotizacion.title}</p>
          </div>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2">
                <th className="text-left py-1.5 pr-3">Descripción</th>
                <th className="text-left py-1.5 px-2 w-16">Unidad</th>
                <th className="text-right py-1.5 px-2 w-14">Cant.</th>
                <th className="text-right py-1.5 px-2 w-28">Precio unit.</th>
                <th className="text-right py-1.5 px-2 w-16">Desc.</th>
                <th className="text-right py-1.5 pl-2 w-28">Total</th>
              </tr>
            </thead>
            <tbody>
              {(cotizacion.items ?? []).map((item) => {
                const disc = item.discountPct ?? 0
                const rowTotal = item.total ?? item.quantity * item.unitPrice * (1 - disc / 100)
                return (
                  <tr key={item.id} className="border-b border-muted">
                    <td className="py-1.5 pr-3">{item.description}</td>
                    <td className="py-1.5 px-2 text-muted-foreground">{item.unit ?? '—'}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{item.quantity}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{DOP_FMT.format(item.unitPrice)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">
                      {disc > 0 ? `${disc}%` : '—'}
                    </td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">{DOP_FMT.format(rowTotal)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="flex justify-end">
            <div className="w-56 space-y-1">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{DOP_FMT.format(cotizacion.subtotal)}</span>
              </div>
              {cotizacion.taxRate > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>ITBIS ({cotizacion.taxRate}%)</span>
                  <span className="tabular-nums">{DOP_FMT.format(cotizacion.taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold border-t pt-1 text-base">
                <span>Total</span>
                <span className="tabular-nums">{DOP_FMT.format(cotizacion.total)}</span>
              </div>
            </div>
          </div>

          {cotizacion.notes && (
            <div>
              <p className="font-semibold mb-1">Notas</p>
              <p className="text-muted-foreground whitespace-pre-wrap">{cotizacion.notes}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="size-4 mr-1" />
            Imprimir
          </Button>
        </DialogFooter>
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
      <DialogContent className="sm:max-w-sm">
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
  clients,
  projects,
  userRole,
}: {
  cotizacion: Quote
  clients: Client[]
  projects: Project[]
  userRole: string
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)

  const isAdmin = userRole === 'ADMIN' || userRole === 'admin'
  const isLocked = !isAdmin && (cotizacion.status === 'approved' || cotizacion.status === 'rejected')

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
            {isLocked ? 'Bloqueada' : 'Editar'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPrintOpen(true)}>
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

      {!isLocked && (
        <EditDialog
          cotizacion={cotizacion}
          clients={clients}
          projects={projects}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
      <PrintDialog cotizacion={cotizacion} open={printOpen} onOpenChange={setPrintOpen} />
      <DeleteDialog cotizacion={cotizacion} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  )
}
