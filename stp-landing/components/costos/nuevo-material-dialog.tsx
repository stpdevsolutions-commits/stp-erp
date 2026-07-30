'use client'

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
import { createMaterial } from '@/lib/actions/costs'
import type { MaterialCategory, Unit } from '@/lib/types'

const schema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  unitId: z.string().min(1, 'Requerido'),
  categoryId: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  barcode: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function NuevoMaterialDialog({
  units,
  categories,
}: {
  units: Unit[]
  categories: MaterialCategory[]
}) {
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { unitId: '', categoryId: '' },
  })

  const unitId = watch('unitId')
  const categoryId = watch('categoryId')

  async function onSubmit(data: FormValues) {
    setServerError(null)
    const result = await createMaterial({
      name: data.name,
      unitId: data.unitId,
      categoryId: data.categoryId || undefined,
      brand: data.brand || undefined,
      model: data.model || undefined,
      barcode: data.barcode || undefined,
      description: data.description || undefined,
      notes: data.notes || undefined,
    })
    if (!result.ok) {
      setServerError(result.error ?? 'Error desconocido')
      return
    }
    reset()
    setOpen(false)
  }

  const noUnits = units.length === 0

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) {
          reset()
          setServerError(null)
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4 mr-1" />
        Nuevo material
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo material</DialogTitle>
          <DialogDescription>
            La unidad no se puede cambiar una vez el material tenga precios registrados.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-full space-y-1.5">
              <Label htmlFor="name">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input id="name" placeholder="Cable THHN #12" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>
                Unidad <span className="text-destructive">*</span>
              </Label>
              <Select value={unitId} onValueChange={(v) => v && setValue('unitId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder={noUnits ? 'No hay unidades' : 'Seleccionar...'} />
                </SelectTrigger>
                <SelectContent>
                  {units
                    .filter((u) => u.isActive)
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.code} — {u.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {errors.unitId && <p className="text-xs text-destructive">{errors.unitId.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Select
                value={categoryId || '__none__'}
                onValueChange={(v) => setValue('categoryId', v === '__none__' ? '' : (v ?? ''))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {categories
                    .filter((c) => c.isActive)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="brand">Marca</Label>
              <Input id="brand" placeholder="Phelps Dodge" {...register('brand')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="model">Modelo</Label>
              <Input id="model" {...register('model')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="barcode">Código de barras</Label>
              <Input id="barcode" {...register('barcode')} />
            </div>

            <div className="col-span-full space-y-1.5">
              <Label htmlFor="description">Descripción</Label>
              <Input id="description" placeholder="Calibre, voltaje, presentación..." {...register('description')} />
            </div>

            <div className="col-span-full space-y-1.5">
              <Label htmlFor="notes">Notas</Label>
              <Input id="notes" {...register('notes')} />
            </div>
          </div>

          <p className="text-muted-foreground text-xs">
            Si ya existe un material con el mismo nombre y marca, el sistema lo rechaza para no
            partir el historial de precios en dos fichas.
          </p>

          {serverError && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
              {serverError}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || noUnits}>
              {isSubmitting ? 'Guardando...' : 'Crear material'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
