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
import { createColaborador } from '@/lib/actions/colaboradores'

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

export function NuevoColaboradorDialog() {
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { status: 'active' },
  })

  async function onSubmit(data: FormValues) {
    setServerError(null)
    const result = await createColaborador({
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
        Nuevo colaborador
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo colaborador</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">Nombre <span className="text-destructive">*</span></Label>
              <Input id="firstName" {...register('firstName')} />
              {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lastName">Apellido <span className="text-destructive">*</span></Label>
              <Input id="lastName" {...register('lastName')} />
              {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cedula">Cédula</Label>
              <Input id="cedula" placeholder="001-0000000-0" {...register('cedula')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="position">Cargo / Posición</Label>
              <Input id="position" placeholder="Electricista" {...register('position')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" placeholder="809-000-0000" {...register('phone')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input id="email" type="email" {...register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dailyRate">Tarifa diaria (DOP)</Label>
              <Input id="dailyRate" type="number" min="0" step="0.01" placeholder="0.00" {...register('dailyRate')} />
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
              <Label htmlFor="notes">Notas</Label>
              <Input id="notes" placeholder="Observaciones" {...register('notes')} />
            </div>
          </div>

          {serverError && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">{serverError}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Guardando...' : 'Crear colaborador'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
