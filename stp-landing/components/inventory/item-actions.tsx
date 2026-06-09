'use client'

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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import type { InventoryItem, InventoryCategory } from '@/lib/types'

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
  quantity: z.string().refine((v) => !isNaN(parseFloat(v)), 'Número inválido'),
  unit: z.string().optional(),
  cost: z.string().refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, 'Número inválido'),
  price: z.string().refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, 'Número inválido'),
  location: z.string().optional(),
  minStock: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.enum(['true', 'false']),
})

type FormValues = z.infer<typeof schema>

export function ItemActions({ item }: { item: InventoryItem }) {
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
      location: item.location ?? '',
      minStock: item.minStock != null ? String(item.minStock) : '',
      notes: item.notes ?? '',
      isActive: item.isActive ? 'true' : 'false',
    },
  })

  const category = watch('category')

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
      location: data.location || undefined,
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
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm">
            <MoreHorizontal className="size-4" />
          </Button>
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar ítem</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
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
                <Select value={watch('unit') || '__none__'} onValueChange={(v) => setValue('unit', v === '__none__' ? '' : v)}>
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
                <Input {...register('location')} />
              </div>
              <div className="space-y-1.5">
                <Label>Stock mínimo</Label>
                <Input type="number" min="0" step="0.01" {...register('minStock')} />
              </div>
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
              <div className="col-span-2 space-y-1.5">
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
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar ítem?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{item.name}</strong> permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
