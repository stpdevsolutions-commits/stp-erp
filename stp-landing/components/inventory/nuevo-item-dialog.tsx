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
import { createInventoryItem } from '@/lib/actions/inventory'
import type { InventoryCategory } from '@/lib/types'

const CATEGORIES: { value: InventoryCategory; label: string }[] = [
  { value: 'materials', label: 'Materiales' },
  { value: 'equipment', label: 'Equipos' },
  { value: 'tools', label: 'Herramientas' },
  { value: 'electrical', label: 'Eléctrico' },
  { value: 'mechanical', label: 'Mecánico' },
  { value: 'consumables', label: 'Consumibles' },
  { value: 'other', label: 'Otro' },
]

const UNITS = ['unid', 'm', 'm²', 'm³', 'kg', 'lb', 'hr', 'día', 'pie', 'pulg', 'gl', 'lt', 'rollo', 'caja', 'juego', 'servicio', 'otro']

const schema = z.object({
  name: z.string().min(1, 'Requerido'),
  sku: z.string().optional(),
  category: z.enum(['materials', 'equipment', 'tools', 'electrical', 'mechanical', 'consumables', 'other']),
  description: z.string().optional(),
  quantity: z.string().refine((v) => !v || !isNaN(parseFloat(v)), 'Número inválido').optional(),
  unit: z.string().optional(),
  cost: z.string().refine((v) => !v || (!isNaN(parseFloat(v)) && parseFloat(v) >= 0), 'Número inválido').optional(),
  price: z.string().refine((v) => !v || (!isNaN(parseFloat(v)) && parseFloat(v) >= 0), 'Número inválido').optional(),
  location: z.string().optional(),
  minStock: z.string().refine((v) => !v || (!isNaN(parseFloat(v)) && parseFloat(v) >= 0), 'Número inválido').optional(),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function NuevoItemDialog() {
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { category: 'other', quantity: '0', cost: '0', price: '0' },
  })

  const category = watch('category')

  async function onSubmit(data: FormValues) {
    setServerError(null)
    const result = await createInventoryItem({
      name: data.name,
      sku: data.sku || undefined,
      category: data.category,
      description: data.description || undefined,
      quantity: data.quantity ? parseFloat(data.quantity) : 0,
      unit: data.unit || undefined,
      cost: data.cost ? parseFloat(data.cost) : 0,
      price: data.price ? parseFloat(data.price) : 0,
      location: data.location || undefined,
      minStock: data.minStock ? parseFloat(data.minStock) : undefined,
      notes: data.notes || undefined,
    })
    if (!result.ok) {
      setServerError(result.error ?? 'Error desconocido')
      return
    }
    reset()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { reset(); setServerError(null) } }}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4 mr-1" />
        Nuevo ítem
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo ítem de inventario</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-full space-y-1.5">
              <Label htmlFor="name">Nombre <span className="text-destructive">*</span></Label>
              <Input id="name" placeholder="Cable AWG 12" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sku">SKU / Código</Label>
              <Input id="sku" placeholder="CAB-AWG-12" {...register('sku')} />
            </div>

            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Select value={category} onValueChange={(v) => v && setValue('category', v as InventoryCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quantity">Cantidad</Label>
              <Input id="quantity" type="number" min="0" step="0.01" {...register('quantity')} />
              {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Unidad de medida</Label>
              <Select value={watch('unit') || '__none__'} onValueChange={(v) => setValue('unit', v === '__none__' ? '' : (v ?? ''))}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cost">Costo (DOP)</Label>
              <Input id="cost" type="number" min="0" step="0.01" {...register('cost')} />
              {errors.cost && <p className="text-xs text-destructive">{errors.cost.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="price">Precio de venta (DOP)</Label>
              <Input id="price" type="number" min="0" step="0.01" {...register('price')} />
              {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="location">Ubicación</Label>
              <Input id="location" placeholder="Almacén A, Estante 3" {...register('location')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="minStock">Stock mínimo</Label>
              <Input id="minStock" type="number" min="0" step="0.01" placeholder="0" {...register('minStock')} />
              {errors.minStock && <p className="text-xs text-destructive">{errors.minStock.message}</p>}
            </div>

            <div className="col-span-full space-y-1.5">
              <Label htmlFor="description">Descripción</Label>
              <Input id="description" placeholder="Descripción opcional" {...register('description')} />
            </div>

            <div className="col-span-full space-y-1.5">
              <Label htmlFor="notes">Notas</Label>
              <Input id="notes" placeholder="Notas internas" {...register('notes')} />
            </div>
          </div>

          {serverError && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">{serverError}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Guardando...' : 'Crear ítem'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
