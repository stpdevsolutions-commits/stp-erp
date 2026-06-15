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
import { updateColaborador, deleteColaborador } from '@/lib/actions/colaboradores'
import type { Collaborator } from '@/lib/types'

const schema = z.object({
  firstName: z.string().min(1, 'Requerido'),
  lastName: z.string().min(1, 'Requerido'),
  email: z.string().email('Correo inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
  position: z.string().optional(),
  cedula: z.string().optional(),
  dailyRate: z.string().optional().refine((v) => !v || (!isNaN(parseFloat(v)) && parseFloat(v) >= 0), 'Número inválido'),
  status: z.enum(['active', 'inactive']),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function ColaboradorActions({ colaborador }: { colaborador: Collaborator }) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: colaborador.firstName,
      lastName: colaborador.lastName,
      email: colaborador.email ?? '',
      phone: colaborador.phone ?? '',
      position: colaborador.position ?? '',
      cedula: colaborador.cedula ?? '',
      dailyRate: colaborador.dailyRate != null ? String(colaborador.dailyRate) : '',
      status: colaborador.status,
      notes: colaborador.notes ?? '',
    },
  })

  async function onSubmit(data: FormValues) {
    setServerError(null)
    const result = await updateColaborador(colaborador.id, {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email || undefined,
      phone: data.phone || undefined,
      position: data.position || undefined,
      cedula: data.cedula || undefined,
      dailyRate: data.dailyRate ? parseFloat(data.dailyRate) : undefined,
      status: data.status,
      notes: data.notes || undefined,
    })
    if (!result.ok) {
      setServerError(result.error ?? 'Error')
      return
    }
    setEditOpen(false)
  }

  async function handleDelete() {
    setDeleting(true)
    await deleteColaborador(colaborador.id)
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

      <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (!o) { reset(); setServerError(null) } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar colaborador</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nombre <span className="text-destructive">*</span></Label>
                <Input {...register('firstName')} />
                {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Apellido <span className="text-destructive">*</span></Label>
                <Input {...register('lastName')} />
                {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Cédula</Label>
                <Input {...register('cedula')} />
              </div>
              <div className="space-y-1.5">
                <Label>Cargo</Label>
                <Input {...register('position')} />
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input {...register('phone')} />
              </div>
              <div className="space-y-1.5">
                <Label>Correo</Label>
                <Input type="email" {...register('email')} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Tarifa diaria (DOP)</Label>
                <Input type="number" min="0" step="0.01" {...register('dailyRate')} />
                {errors.dailyRate && <p className="text-xs text-destructive">{errors.dailyRate.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Select value={watch('status')} onValueChange={(v) => v && setValue('status', v as 'active' | 'inactive')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Activo</SelectItem>
                    <SelectItem value="inactive">Inactivo</SelectItem>
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

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Eliminar colaborador?</DialogTitle>
            <DialogDescription>
              Se eliminará a <strong>{colaborador.firstName} {colaborador.lastName}</strong> permanentemente.
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
