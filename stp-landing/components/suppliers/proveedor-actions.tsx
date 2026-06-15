﻿'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
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
import type { Supplier } from '@/lib/types'
import { updateSupplier, deleteSupplier } from '@/lib/actions/suppliers'

const CATEGORY_LABELS = {
  materials: 'Materiales',
  equipment: 'Equipos',
  services: 'Servicios',
  subcontract: 'Subcontrato',
  other: 'Otro',
}

const editSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres').max(200),
  category: z.enum(['materials', 'equipment', 'services', 'subcontract', 'other']),
  rnc: z.string().optional(),
  email: z.string().email('Correo inválido').optional().or(z.literal('')),
  phone: z.string().max(20).optional(),
  city: z.string().max(100).optional(),
  address: z.string().max(255).optional(),
  contactName: z.string().max(150).optional(),
  contactPhone: z.string().max(20).optional(),
  notes: z.string().optional(),
  isActive: z.boolean(),
})

type EditFormValues = z.infer<typeof editSchema>

function EditDialog({
  proveedor,
  open,
  onOpenChange,
}: {
  proveedor: Supplier
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
      name: proveedor.name,
      category: proveedor.category,
      rnc: proveedor.rnc ?? '',
      email: proveedor.email ?? '',
      phone: proveedor.phone ?? '',
      city: proveedor.city ?? '',
      address: proveedor.address ?? '',
      contactName: proveedor.contactName ?? '',
      contactPhone: proveedor.contactPhone ?? '',
      notes: proveedor.notes ?? '',
      isActive: proveedor.isActive,
    },
  })

  function handleClose() {
    setServerError(null)
    onOpenChange(false)
  }

  async function onSubmit(data: EditFormValues) {
    setServerError(null)
    const result = await updateSupplier(proveedor.id, data)
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
          <DialogTitle>Editar proveedor</DialogTitle>
          <DialogDescription>Modifica los datos de {proveedor.name}.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-full space-y-1.5">
              <Label htmlFor="ep-name">Nombre <span className="text-destructive">*</span></Label>
              <Input id="ep-name" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Select
                value={watch('category')}
                onValueChange={(v) => v && setValue('category', v as EditFormValues['category'])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ep-rnc">RNC / Cédula</Label>
              <Input id="ep-rnc" {...register('rnc')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ep-email">Correo electrónico</Label>
              <Input id="ep-email" type="email" {...register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ep-phone">Teléfono</Label>
              <Input id="ep-phone" {...register('phone')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ep-city">Ciudad</Label>
              <Input id="ep-city" {...register('city')} />
            </div>

            <div className="col-span-full space-y-1.5">
              <Label htmlFor="ep-address">Dirección</Label>
              <Input id="ep-address" {...register('address')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ep-contactName">Persona de contacto</Label>
              <Input id="ep-contactName" {...register('contactName')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ep-contactPhone">Tel. de contacto</Label>
              <Input id="ep-contactPhone" {...register('contactPhone')} />
            </div>

            <div className="col-span-full space-y-1.5">
              <Label htmlFor="ep-notes">Notas</Label>
              <Input id="ep-notes" {...register('notes')} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input id="ep-isActive" type="checkbox" className="size-4 rounded border-input" {...register('isActive')} />
            <Label htmlFor="ep-isActive">Proveedor activo</Label>
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
  proveedor,
  open,
  onOpenChange,
}: {
  proveedor: Supplier
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    setError(null)
    const result = await deleteSupplier(proveedor.id)
    setLoading(false)
    if (!result.ok) { setError(result.error ?? 'Error al eliminar'); return }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Eliminar proveedor</DialogTitle>
          <DialogDescription>
            ¿Eliminar a <span className="font-semibold text-foreground">{proveedor.name}</span>? Esta acción no se puede deshacer.
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

export function ProveedorActions({ proveedor }: { proveedor: Supplier }) {
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
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-4" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <EditDialog proveedor={proveedor} open={editOpen} onOpenChange={setEditOpen} />
      <DeleteDialog proveedor={proveedor} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  )
}
