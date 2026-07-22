﻿'use client'

import { useState } from 'react'
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
import type { Project, Supplier } from '@/lib/types'
import { createExpense } from '@/lib/actions/expenses'

const CATEGORY_LABELS = {
  materials: 'Materiales',
  labor: 'Mano de obra',
  equipment: 'Equipos',
  subcontract: 'Subcontrato',
  travel: 'Transporte / Viaje',
  other: 'Otro',
}

const schema = z.object({
  projectId: z.string().min(1, 'Selecciona un proyecto'),
  description: z.string().min(2, 'Mínimo 2 caracteres'),
  category: z.enum(['materials', 'labor', 'equipment', 'subcontract', 'travel', 'other']),
  amount: z.string().min(1, 'Requerido').refine((v) => parseFloat(v) > 0, 'Debe ser > 0'),
  date: z.string().min(1, 'Requerido'),
  supplierId: z.string().optional(),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function NuevoGastoDialog({
  projects,
  suppliers,
}: {
  projects: Project[]
  suppliers: Supplier[]
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
    defaultValues: { category: 'materials', date: today, supplierId: '' },
  })

  const projectId = watch('projectId')
  const selectedProjectName = projects.find((p) => p.id === projectId)?.name

  const supplierId = watch('supplierId')
  const selectedSupplierName = suppliers.find((s) => s.id === supplierId)?.name

  async function onSubmit(data: FormValues) {
    setServerError(null)
    const result = await createExpense({
      projectId: data.projectId,
      description: data.description,
      category: data.category,
      amount: parseFloat(data.amount),
      date: data.date,
      supplierId: data.supplierId || undefined,
      notes: data.notes || undefined,
    })
    if (!result.ok) {
      setServerError(result.error ?? 'Error desconocido')
      return
    }
    reset({ category: 'materials', date: today, supplierId: '' })
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) { reset({ category: 'materials', date: today, supplierId: '' }); setServerError(null) }
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
              <Label htmlFor="g-amount">Monto (RD$) <span className="text-destructive">*</span></Label>
              <Input id="g-amount" type="number" min="0.01" step="0.01" placeholder="0.00" {...register('amount')} />
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
