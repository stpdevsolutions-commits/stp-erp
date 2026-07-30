﻿'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Material, Project, Supplier } from '@/lib/types'
import { createExpense } from '@/lib/actions/expenses'

const CATEGORY_LABELS = {
  materials: 'Materiales',
  labor: 'Mano de obra',
  equipment: 'Equipos',
  subcontract: 'Subcontrato',
  travel: 'Transporte / Viaje',
  other: 'Otro',
}

const hasNum = (v?: string) => Boolean(v) && !isNaN(parseFloat(v as string))

const schema = z
  .object({
    projectId: z.string().min(1, 'Selecciona un proyecto'),
    description: z.string().min(2, 'Mínimo 2 caracteres'),
    category: z.enum(['materials', 'labor', 'equipment', 'subcontract', 'travel', 'other']),
    amount: z.string().optional(),
    date: z.string().min(1, 'Requerido'),
    supplierId: z.string().optional(),
    notes: z.string().optional(),
    // Desglose opcional: alimenta la base de precios del módulo de Costos.
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

type FormValues = z.infer<typeof schema>

export function NuevoGastoDialog({
  projects,
  suppliers,
  materials = [],
}: {
  projects: Project[]
  suppliers: Supplier[]
  materials?: Material[]
}) {
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { category: 'materials', date: today, supplierId: '', itbisIncluded: 'false' },
  })

  const projectId = watch('projectId')
  const selectedProjectName = projects.find((p) => p.id === projectId)?.name

  const supplierId = watch('supplierId')
  const selectedSupplierName = suppliers.find((s) => s.id === supplierId)?.name

  // Con desglose, el importe lo calcula el servidor: se muestra solo como vista previa.
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

  async function onSubmit(data: FormValues) {
    setServerError(null)
    const q = parseFloat(data.quantity ?? '')
    const up = parseFloat(data.unitPrice ?? '')
    const breakdown = !isNaN(q) && !isNaN(up)

    const result = await createExpense({
      projectId: data.projectId,
      description: data.description,
      category: data.category,
      // Si hay desglose no se manda amount: manda cantidad × unitario del servidor.
      amount: breakdown ? undefined : parseFloat(data.amount as string),
      date: data.date,
      supplierId: data.supplierId || undefined,
      notes: data.notes || undefined,
      quantity: breakdown ? q : undefined,
      unitPrice: breakdown ? up : undefined,
      materialId: data.materialId || undefined,
      itbisIncluded: data.itbisIncluded === 'true',
    })
    if (!result.ok) {
      setServerError(result.error ?? 'Error desconocido')
      return
    }
    reset({ category: 'materials', date: today, supplierId: '', itbisIncluded: 'false' })
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) { reset({ category: 'materials', date: today, supplierId: '', itbisIncluded: 'false' }); setServerError(null) }
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4 mr-1" />
        Nuevo gasto
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo gasto</DialogTitle>
          <DialogDescription>Registra un gasto asociado a un proyecto.</DialogDescription>
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
              <Label htmlFor="g-description">Descripción <span className="text-destructive">*</span></Label>
              <Input id="g-description" placeholder="Compra de cable 12 AWG..." {...register('description')} />
              {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Select
                value={watch('category')}
                onValueChange={(v) => v && setValue('category', v as FormValues['category'])}
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
              <Label htmlFor="g-amount">
                Monto (RD$) {!hasBreakdown && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="g-amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                disabled={hasBreakdown}
                {...register('amount')}
              />
              {hasBreakdown && (
                <p className="text-muted-foreground text-xs">Calculado: cantidad × unitario</p>
              )}
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="g-date">Fecha <span className="text-destructive">*</span></Label>
              <Input id="g-date" type="date" {...register('date')} />
              {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
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
              <Label htmlFor="g-notes">Notas</Label>
              <Input id="g-notes" placeholder="Factura #..." {...register('notes')} />
            </div>

            {/* ── Desglose: convierte el gasto en un dato de precio ──────── */}
            <div className="col-span-full space-y-3 rounded-md border border-dashed p-3">
              <div>
                <p className="text-sm font-medium">Desglose (opcional)</p>
                <p className="text-muted-foreground text-xs">
                  Si indicas material, cantidad y precio unitario, la compra entra sola al
                  historial de precios del material.
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
                  {materials.length === 0 && (
                    <p className="text-muted-foreground text-xs">
                      No hay materiales en el catálogo todavía.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="g-quantity">
                    Cantidad {selectedMaterial?.unit ? `(${selectedMaterial.unit.code})` : ''}
                  </Label>
                  <Input id="g-quantity" type="number" min="0" step="0.0001" {...register('quantity')} />
                  {errors.quantity && (
                    <p className="text-xs text-destructive">{errors.quantity.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="g-unitPrice">Precio unitario (RD$)</Label>
                  <Input id="g-unitPrice" type="number" min="0" step="0.0001" {...register('unitPrice')} />
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Crear gasto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
