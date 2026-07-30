﻿'use client'

import { useEffect, useState } from 'react'
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
import type { Expense, Project, Supplier, Material } from '@/lib/types'
import { updateExpense, deleteExpense } from '@/lib/actions/expenses'

const CATEGORY_LABELS = {
  materials: 'Materiales',
  labor: 'Mano de obra',
  equipment: 'Equipos',
  subcontract: 'Subcontrato',
  travel: 'Transporte / Viaje',
  other: 'Otro',
}

const hasNum = (v?: string) => Boolean(v) && !isNaN(parseFloat(v as string))

const editSchema = z
  .object({
    projectId: z.string().min(1, 'Selecciona un proyecto'),
    description: z.string().min(2, 'Mínimo 2 caracteres'),
    category: z.enum(['materials', 'labor', 'equipment', 'subcontract', 'travel', 'other']),
    amount: z.string().optional(),
    date: z.string().min(1, 'Requerido'),
    supplierId: z.string().optional(),
    notes: z.string().optional(),
    materialId: z.string().optional(),
    quantity: z.string().optional(),
    unitPrice: z.string().optional(),
    itbisIncluded: z.enum(['true', 'false']),
  })
  .refine((d) => hasNum(d.quantity) === hasNum(d.unitPrice), {
    message: 'Cantidad y precio unitario van juntos',
    path: ['unitPrice'],
  })
  .refine((d) => hasNum(d.quantity) || (hasNum(d.amount) && parseFloat(d.amount as string) > 0), {
    message: 'Indica el monto, o la cantidad y el precio unitario',
    path: ['amount'],
  })
  .refine((d) => !hasNum(d.quantity) || parseFloat(d.quantity as string) > 0, {
    message: 'Debe ser > 0',
    path: ['quantity'],
  })

type EditFormValues = z.infer<typeof editSchema>

function EditDialog({
  gasto,
  projects,
  suppliers,
  materials,
  open,
  onOpenChange,
}: {
  gasto: Expense
  projects: Project[]
  suppliers: Supplier[]
  materials: Material[]
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
      projectId: gasto.projectId,
      description: gasto.description,
      category: gasto.category,
      amount: String(gasto.amount),
      date: gasto.date.slice(0, 10),
      supplierId: gasto.supplierId ?? '',
      notes: gasto.notes ?? '',
      materialId: gasto.materialId ?? '',
      quantity: gasto.quantity != null ? String(gasto.quantity) : '',
      unitPrice: gasto.unitPrice != null ? String(gasto.unitPrice) : '',
      itbisIncluded: gasto.itbisIncluded ? 'true' : 'false',
    },
  })

  const projectId = watch('projectId')
  const selectedProjectName = projects.find((p) => p.id === projectId)?.name
  const supplierId = watch('supplierId')
  const selectedSupplierName = suppliers.find((s) => s.id === supplierId)?.name

  const qty = parseFloat(watch('quantity') ?? '')
  const unitPrice = parseFloat(watch('unitPrice') ?? '')
  const hasBreakdown = !isNaN(qty) && !isNaN(unitPrice)
  const computedAmount = hasBreakdown ? Math.round(qty * unitPrice * 100) / 100 : null

  // Se escribe el importe calculado en el campo en vez de pasarlo como `value`: así el
  // input sigue siendo no-controlado y React no avisa por cambiar de modo a mitad de vida.
  useEffect(() => {
    if (computedAmount != null) setValue('amount', String(computedAmount))
  }, [computedAmount, setValue])
  const materialId = watch('materialId')
  const selectedMaterial = materials.find((m) => m.id === materialId)

  function handleClose() {
    setServerError(null)
    onOpenChange(false)
  }

  async function onSubmit(data: EditFormValues) {
    setServerError(null)
    const q = parseFloat(data.quantity ?? '')
    const up = parseFloat(data.unitPrice ?? '')
    const breakdown = !isNaN(q) && !isNaN(up)

    const result = await updateExpense(gasto.id, {
      projectId: data.projectId,
      description: data.description,
      category: data.category,
      // Con desglose el importe lo recalcula el servidor.
      ...(breakdown ? {} : { amount: parseFloat(data.amount as string) }),
      date: data.date,
      supplierId: data.supplierId || null,
      notes: data.notes || null,
      quantity: breakdown ? q : null,
      unitPrice: breakdown ? up : null,
      materialId: data.materialId || null,
      itbisIncluded: data.itbisIncluded === 'true',
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
          <DialogTitle>Editar gasto</DialogTitle>
          <DialogDescription>{gasto.description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-full space-y-1.5">
              <Label>Proyecto <span className="text-destructive">*</span></Label>
              <Select
                value={watch('projectId') ?? ''}
                onValueChange={(v) => v && setValue('projectId', v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar proyecto">
                    {selectedProjectName}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.projectId && <p className="text-xs text-destructive">{errors.projectId.message}</p>}
            </div>

            <div className="col-span-full space-y-1.5">
              <Label htmlFor="eg-description">Descripción <span className="text-destructive">*</span></Label>
              <Input id="eg-description" {...register('description')} />
              {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Select
                value={watch('category')}
                onValueChange={(v) => v && setValue('category', v as EditFormValues['category'])}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="eg-amount">
                Monto (RD$) {!hasBreakdown && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="eg-amount"
                type="number"
                min="0.01"
                step="0.01"
                disabled={hasBreakdown}
                {...register('amount')}
              />
              {hasBreakdown && (
                <p className="text-muted-foreground text-xs">Calculado: cantidad × unitario</p>
              )}
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="eg-date">Fecha <span className="text-destructive">*</span></Label>
              <Input id="eg-date" type="date" {...register('date')} />
            </div>

            <div className="space-y-1.5">
              <Label>Proveedor</Label>
              <Select
                value={watch('supplierId') ?? ''}
                onValueChange={(v) => setValue('supplierId', v ?? '')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="— Ninguno —">
                    {supplierId ? selectedSupplierName : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Ninguno —</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-full space-y-1.5">
              <Label htmlFor="eg-notes">Notas</Label>
              <Input id="eg-notes" {...register('notes')} />
            </div>

            {/* ── Desglose: alimenta el historial de precios ─────────────── */}
            <div className="col-span-full space-y-3 rounded-md border border-dashed p-3">
              <div>
                <p className="text-sm font-medium">Desglose (opcional)</p>
                <p className="text-muted-foreground text-xs">
                  Al editarlo se reemplaza el precio derivado: el anterior queda anulado en el
                  historial, no se pierde.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="col-span-full space-y-1.5">
                  <Label>Material</Label>
                  <Select
                    value={materialId || '__none__'}
                    onValueChange={(v) => setValue('materialId', v === '__none__' ? '' : (v ?? ''))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="— Ninguno —">
                        {selectedMaterial
                          ? `${selectedMaterial.code} — ${selectedMaterial.name}`
                          : undefined}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Ninguno —</SelectItem>
                      {materials.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.code} — {m.name}
                          {m.unit ? ` (${m.unit.code})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="eg-quantity">
                    Cantidad {selectedMaterial?.unit ? `(${selectedMaterial.unit.code})` : ''}
                  </Label>
                  <Input id="eg-quantity" type="number" min="0" step="0.0001" {...register('quantity')} />
                  {errors.quantity && (
                    <p className="text-xs text-destructive">{errors.quantity.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="eg-unitPrice">Precio unitario (RD$)</Label>
                  <Input id="eg-unitPrice" type="number" min="0" step="0.0001" {...register('unitPrice')} />
                  {errors.unitPrice && (
                    <p className="text-xs text-destructive">{errors.unitPrice.message}</p>
                  )}
                </div>

                <div className="col-span-full space-y-1.5">
                  <Label>¿El unitario trae ITBIS incluido?</Label>
                  <Select
                    value={watch('itbisIncluded')}
                    onValueChange={(v) => v && setValue('itbisIncluded', v as 'true' | 'false')}
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="false">No, es sin ITBIS</SelectItem>
                      <SelectItem value="true">Sí, incluye 18%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
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
  gasto,
  open,
  onOpenChange,
}: {
  gasto: Expense
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    setError(null)
    const result = await deleteExpense(gasto.id)
    setLoading(false)
    if (!result.ok) { setError(result.error ?? 'Error al eliminar'); return }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Eliminar gasto</DialogTitle>
          <DialogDescription>
            ¿Eliminar <span className="font-semibold text-foreground">{gasto.description}</span>? Esta acción no se puede deshacer.
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

export function GastoActions({
  gasto,
  projects,
  suppliers,
  materials = [],
}: {
  gasto: Expense
  projects: Project[]
  suppliers: Supplier[]
  materials?: Material[]
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
            onClick={() => window.open(`/api/files/expense/${gasto.id}?v=${Date.now()}`, '_blank')}
          >
            <FileText className="size-4" />
            Ver PDF
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              const win = window.open(`/api/files/expense/${gasto.id}?v=${Date.now()}`, '_blank')
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
      <EditDialog
        gasto={gasto}
        projects={projects}
        suppliers={suppliers}
        materials={materials}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <DeleteDialog gasto={gasto} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  )
}
