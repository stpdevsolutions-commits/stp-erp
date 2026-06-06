'use client'

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
import type { Client } from '@/lib/types'
import { updateClient, deleteClient } from '@/lib/actions/clients'

// ── Zod schema ────────────────────────────────────────────────────────────────

const editSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres').max(150),
  type: z.enum(['company', 'individual']),
  rnc: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{9}$|^\d{11}$/.test(v), 'RNC: 9 dígitos o cédula: 11 dígitos'),
  email: z.string().email('Correo inválido').optional().or(z.literal('')),
  phone: z.string().max(20).optional(),
  address: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  contactName: z.string().max(150).optional(),
  contactPhone: z.string().max(20).optional(),
  notes: z.string().optional(),
  isActive: z.boolean(),
})

type EditFormValues = z.infer<typeof editSchema>

// ── Edit dialog ───────────────────────────────────────────────────────────────

function EditDialog({
  cliente,
  open,
  onOpenChange,
}: {
  cliente: Client
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: cliente.name,
      type: cliente.type,
      rnc: cliente.rnc ?? '',
      email: cliente.email ?? '',
      phone: cliente.phone ?? '',
      address: cliente.address ?? '',
      city: cliente.city ?? '',
      contactName: cliente.contactName ?? '',
      contactPhone: cliente.contactPhone ?? '',
      notes: cliente.notes ?? '',
      isActive: cliente.isActive,
    },
  })

  function handleClose() {
    setServerError(null)
    onOpenChange(false)
  }

  async function onSubmit(data: EditFormValues) {
    setServerError(null)
    const result = await updateClient(cliente.id, data)
    if (!result.ok) {
      setServerError(result.error ?? 'Error desconocido')
      return
    }
    handleClose()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar cliente</DialogTitle>
          <DialogDescription>Modifica los datos de {cliente.name}.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="edit-name">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input id="edit-name" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={watch('type')}
                onValueChange={(v) => setValue('type', v as 'company' | 'individual')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">Empresa</SelectItem>
                  <SelectItem value="individual">Persona física</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-rnc">RNC / Cédula</Label>
              <Input id="edit-rnc" placeholder="131XXXXXX o 00XXXXXXXXX" {...register('rnc')} />
              {errors.rnc && <p className="text-xs text-destructive">{errors.rnc.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-email">Correo electrónico</Label>
              <Input id="edit-email" type="email" {...register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-phone">Teléfono</Label>
              <Input id="edit-phone" {...register('phone')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-city">Ciudad</Label>
              <Input id="edit-city" {...register('city')} />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="edit-address">Dirección</Label>
              <Input id="edit-address" {...register('address')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-contactName">Persona de contacto</Label>
              <Input id="edit-contactName" {...register('contactName')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-contactPhone">Teléfono de contacto</Label>
              <Input id="edit-contactPhone" {...register('contactPhone')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-notes">Notas</Label>
            <textarea
              id="edit-notes"
              {...register('notes')}
              rows={3}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="edit-isActive"
              type="checkbox"
              className="size-4 rounded border-input"
              {...register('isActive')}
            />
            <Label htmlFor="edit-isActive">Cliente activo</Label>
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

// ── Delete confirmation dialog ────────────────────────────────────────────────

function DeleteDialog({
  cliente,
  open,
  onOpenChange,
}: {
  cliente: Client
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    setError(null)
    const result = await deleteClient(cliente.id)
    setLoading(false)
    if (!result.ok) {
      setError(result.error ?? 'Error al eliminar')
      return
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Eliminar cliente</DialogTitle>
          <DialogDescription>
            ¿Estás seguro de que deseas eliminar a{' '}
            <span className="font-semibold text-foreground">{cliente.name}</span>? Esta acción no
            se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
            {error}
          </p>
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

export function ClientActions({ cliente }: { cliente: Client }) {
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

      <EditDialog cliente={cliente} open={editOpen} onOpenChange={setEditOpen} />
      <DeleteDialog cliente={cliente} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  )
}
