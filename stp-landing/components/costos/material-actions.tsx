'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MoreHorizontal, Pencil, Trash2, LineChart } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { updateMaterial, deleteMaterial } from '@/lib/actions/costs'
import type { Material, MaterialCategory, Unit } from '@/lib/types'

const schema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  unitId: z.string().min(1, 'Requerido'),
  categoryId: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  barcode: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.enum(['true', 'false']),
})

type FormValues = z.infer<typeof schema>

export function MaterialActions({
  material,
  units,
  categories,
}: {
  material: Material
  units: Unit[]
  categories: MaterialCategory[]
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: material.name,
      unitId: material.unitId,
      categoryId: material.categoryId ?? '',
      brand: material.brand ?? '',
      model: material.model ?? '',
      barcode: material.barcode ?? '',
      description: material.description ?? '',
      notes: material.notes ?? '',
      isActive: material.isActive ? 'true' : 'false',
    },
  })

  const hasPrices = (material.priceSummary?.count ?? 0) > 0

  async function onSubmit(data: FormValues) {
    setServerError(null)
    const result = await updateMaterial(material.id, {
      name: data.name,
      // La unidad no se manda si ya hay precios: la API lo rechazaría de todos modos.
      ...(hasPrices ? {} : { unitId: data.unitId }),
      categoryId: data.categoryId || undefined,
      brand: data.brand || undefined,
      model: data.model || undefined,
      barcode: data.barcode || undefined,
      description: data.description || undefined,
      notes: data.notes || undefined,
      isActive: data.isActive === 'true',
    })
    if (!result.ok) {
      setServerError(result.error ?? 'Error')
      return
    }
    setEditOpen(false)
  }

  async function handleDelete() {
    setDeleting(true)
    setDeleteError(null)
    const result = await deleteMaterial(material.id)
    setDeleting(false)
    if (!result.ok) {
      setDeleteError(result.error ?? 'Error al eliminar')
      return
    }
    setDeleteOpen(false)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            render={<Link href={`/dashboard/costos/materiales/${material.id}`} />}
          >
            <LineChart className="size-3.5 mr-2" /> Ver precios
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="size-3.5 mr-2" /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-3.5 mr-2" /> Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o)
          if (!o) {
            reset()
            setServerError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar material</DialogTitle>
            <DialogDescription className="font-mono text-xs">{material.code}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="col-span-full space-y-1.5">
                <Label>
                  Nombre <span className="text-destructive">*</span>
                </Label>
                <Input {...register('name')} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Unidad</Label>
                <Select
                  value={watch('unitId')}
                  onValueChange={(v) => v && setValue('unitId', v)}
                  disabled={hasPrices}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.code} — {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {hasPrices && (
                  <p className="text-muted-foreground text-xs">
                    Bloqueada: el material ya tiene {material.priceSummary?.count} precio(s) en esta
                    unidad.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select
                  value={watch('categoryId') || '__none__'}
                  onValueChange={(v) => setValue('categoryId', v === '__none__' ? '' : (v ?? ''))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Marca</Label>
                <Input {...register('brand')} />
              </div>

              <div className="space-y-1.5">
                <Label>Modelo</Label>
                <Input {...register('model')} />
              </div>

              <div className="space-y-1.5">
                <Label>Código de barras</Label>
                <Input {...register('barcode')} />
              </div>

              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Select
                  value={watch('isActive')}
                  onValueChange={(v) => v && setValue('isActive', v as 'true' | 'false')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Activo</SelectItem>
                    <SelectItem value="false">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-full space-y-1.5">
                <Label>Descripción</Label>
                <Input {...register('description')} />
              </div>

              <div className="col-span-full space-y-1.5">
                <Label>Notas</Label>
                <Input {...register('notes')} />
              </div>
            </div>

            {serverError && (
              <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
                {serverError}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando...' : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o)
          if (!o) setDeleteError(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Eliminar material?</DialogTitle>
            <DialogDescription>
              Se eliminará <strong>{material.name}</strong> ({material.code}).
              {hasPrices && (
                <>
                  {' '}
                  Tiene {material.priceSummary?.count} precio(s) registrados, así que el sistema
                  no permitirá borrarlo — desactívalo en su lugar para conservar el historial.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
              {deleteError}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
