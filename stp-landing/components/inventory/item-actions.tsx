﻿'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
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
import { updateInventoryItem, deleteInventoryItem } from '@/lib/actions/inventory'
import type { InventoryItem, InventoryCategory, InventoryLocationStatus, Project } from '@/lib/types'

const CATEGORIES: { value: InventoryCategory; label: string }[] = [
  { value: 'materials', label: 'Materiales' },
  { value: 'equipment', label: 'Equipos' },
  { value: 'tools', label: 'Herramientas' },
  { value: 'electrical', label: 'Eléctrico' },
  { value: 'mechanical', label: 'Mecánico' },
  { value: 'consumables', label: 'Consumibles' },
  { value: 'other', label: 'Otro' },
]

const LOCATION_STATUSES: { value: InventoryLocationStatus; label: string }[] = [
  { value: 'warehouse', label: 'Almacén principal' },
  { value: 'repair', label: 'En reparación' },
  { value: 'loaned', label: 'Prestado' },
  { value: 'assigned', label: 'Asignado a proyecto' },
]

const UNITS = ['unid', 'm', 'm²', 'm³', 'kg', 'lb', 'hr', 'día', 'pie', 'pulg', 'gl', 'lt', 'rollo', 'caja', 'juego', 'servicio', 'otro']

const schema = z
  .object({
    name: z.string().min(1, 'Requerido'),
    sku: z.string().optional(),
    category: z.enum(['materials', 'equipment', 'tools', 'electrical', 'mechanical', 'consumables', 'other']),
    quantity: z.string().refine((v) => !isNaN(parseFloat(v)), 'Número inválido'),
    unit: z.string().optional(),
    cost: z.string().refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, 'Número inválido'),
    price: z.string().refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, 'Número inválido'),
    locationStatus: z.enum(['warehouse', 'repair', 'loaned', 'assigned']),
    loanedToName: z.string().optional(),
    assignedProjectId: z.string().optional(),
    minStock: z.string().optional(),
    notes: z.string().optional(),
    isActive: z.enum(['true', 'false']),
  })
  .refine((d) => d.locationStatus !== 'loaned' || Boolean(d.loanedToName?.trim()), {
    message: 'Indica a quién se le prestó',
    path: ['loanedToName'],
  })
  .refine((d) => d.locationStatus !== 'assigned' || Boolean(d.assignedProjectId), {
    message: 'Selecciona el proyecto',
    path: ['assignedProjectId'],
  })

type FormValues = z.infer<typeof schema>

export function ItemActions({ item, projects }: { item: InventoryItem; projects: Project[] }) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: item.name,
      sku: item.sku ?? '',
      category: item.category,
      quantity: String(item.quantity),
      unit: item.unit ?? '',
      cost: String(item.cost),
      price: String(item.price),
      locationStatus: item.locationStatus,
      loanedToName: item.loanedToName ?? '',
      assignedProjectId: item.assignedProjectId ?? '',
      minStock: item.minStock != null ? String(item.minStock) : '',
      notes: item.notes ?? '',
      isActive: item.isActive ? 'true' : 'false',
    },
  })

  const category = watch('category')
  const locationStatus = watch('locationStatus')

  async function onSubmit(data: FormValues) {
    setServerError(null)
    const result = await updateInventoryItem(item.id, {
      name: data.name,
      sku: data.sku || undefined,
      category: data.category,
      quantity: parseFloat(data.quantity),
      unit: data.unit || undefined,
      cost: parseFloat(data.cost),
      price: parseFloat(data.price),
      locationStatus: data.locationStatus,
      loanedToName: data.locationStatus === 'loaned' ? data.loanedToName : undefined,
      assignedProjectId: data.locationStatus === 'assigned' ? data.assignedProjectId : undefined,
      minStock: data.minStock ? parseFloat(data.minStock) : undefined,
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
    await deleteInventoryItem(item.id)
    setDeleting(false)
    setDeleteOpen(false)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="size-3.5 mr-2" /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-3.5 mr-2" /> Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (!o) { reset(); setServerError(null) } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar ítem</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="col-span-full space-y-1.5">
                <Label>Nombre <span className="text-destructive">*</span></Label>
                <Input {...register('name')} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>SKU / Código</Label>
                <Input {...register('sku')} />
              </div>
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select value={category} onValueChange={(v) => v && setValue('category', v as InventoryCategory)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Cantidad</Label>
                <Input type="number" step="0.01" {...register('quantity')} />
                {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Unidad</Label>
                <Select value={watch('unit') || '__none__'} onValueChange={(v) => setValue('unit', v === '__none__' ? '' : (v ?? ''))}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Costo (DOP)</Label>
                <Input type="number" min="0" step="0.01" {...register('cost')} />
                {errors.cost && <p className="text-xs text-destructive">{errors.cost.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Precio venta (DOP)</Label>
                <Input type="number" min="0" step="0.01" {...register('price')} />
                {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Ubicación</Label>
                <Select
                  value={locationStatus}
                  onValueChange={(v) => v && setValue('locationStatus', v as InventoryLocationStatus)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LOCATION_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Stock mínimo</Label>
                <Input type="number" min="0" step="0.01" {...register('minStock')} />
              </div>
              {locationStatus === 'loaned' && (
                <div className="space-y-1.5">
                  <Label>Prestado a</Label>
                  <Input placeholder="Nombre de quien lo tiene" {...register('loanedToName')} />
                  {errors.loanedToName && <p className="text-xs text-destructive">{errors.loanedToName.message}</p>}
                </div>
              )}
              {locationStatus === 'assigned' && (
                <div className="space-y-1.5">
                  <Label>Proyecto asignado</Label>
                  <Select
                    value={watch('assignedProjectId') || ''}
                    onValueChange={(v) => v && setValue('assignedProjectId', v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Seleccionar proyecto" /></SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {errors.assignedProjectId && <p className="text-xs text-destructive">{errors.assignedProjectId.message}</p>}
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Select value={watch('isActive')} onValueChange={(v) => v && setValue('isActive', v as 'true' | 'false')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Activo</SelectItem>
                    <SelectItem value="false">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-full space-y-1.5">
                <Label>Notas</Label>
                <Input {...register('notes')} />
              </div>
            </div>
            {serverError && <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">{serverError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Guardando...' : 'Guardar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Eliminar ítem?</DialogTitle>
            <DialogDescription>
              Se eliminará <strong>{item.name}</strong> permanentemente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>Cancelar</Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
