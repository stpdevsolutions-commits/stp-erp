﻿'use client'

import { toast } from '@/lib/toast'
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
import { createClient, lookupClientRnc } from '@/lib/actions/clients'

const schema = z.object({
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
})

type FormValues = z.infer<typeof schema>

/**
 * Alta de cliente. Se usa suelto en el módulo de Clientes y también incrustado en
 * otros formularios (cotizaciones), donde hace falta un disparador propio y saber
 * qué cliente se creó para dejarlo seleccionado sin recargar ni perder lo escrito.
 */
export function NuevoClienteDialog({
  trigger,
  onCreated,
}: {
  trigger?: React.ReactNode
  onCreated?: (client: { id: string; name: string }) => void
} = {}) {
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [rncStatus, setRncStatus] = useState<{ kind: 'loading' | 'ok' | 'warn'; text: string } | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'company' },
  })

  /** Al salir del campo RNC: si es válido, trae de la DGII el nombre (y el nombre comercial) y el tipo. */
  async function buscarRnc(raw: string) {
    const rnc = raw.replace(/\D/g, '')
    if (!/^(\d{9}|\d{11})$/.test(rnc)) {
      setRncStatus(null)
      return
    }
    setRncStatus({ kind: 'loading', text: 'Consultando la DGII…' })
    const res = await lookupClientRnc(rnc)
    if (!res.ok || !res.data) {
      setRncStatus({ kind: 'warn', text: res.error ?? 'No se pudo consultar la DGII. Completa los datos a mano.' })
      return
    }
    if (!res.data.found) {
      setRncStatus({ kind: 'warn', text: res.data.message ?? 'La DGII no encontró ese RNC.' })
      return
    }
    // Solo se rellena lo que está vacío: nunca se pisa lo que la persona ya escribió.
    if (!watch('name')) setValue('name', res.data.name ?? res.data.tradeName ?? '', { shouldValidate: true })
    setValue('type', rnc.length === 11 ? 'individual' : 'company')
    if (!watch('notes') && res.data.activity) setValue('notes', `Actividad (DGII): ${res.data.activity}`)
    const estado = res.data.status ? ` · ${res.data.status}` : ''
    setRncStatus({
      kind: res.data.status && !/activo/i.test(res.data.status) ? 'warn' : 'ok',
      text: `DGII: ${res.data.name}${estado}. La DGII no publica dirección, teléfono ni correo: complétalos a mano.`,
    })
  }

  async function onSubmit(data: FormValues) {
    setServerError(null)
    const result = await createClient(data)
    if (!result.ok) {
      setServerError(result.error ?? 'Error desconocido')
      return
    }
    toast.success('Cliente creado')
    if (result.client) onCreated?.(result.client)
    reset()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { reset(); setServerError(null); setRncStatus(null) } }}>
      {trigger ?? (
        <DialogTrigger render={<Button size="sm" />}>
          <Plus className="size-4 mr-1" />
          Nuevo cliente
        </DialogTrigger>
      )}

      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
          <DialogDescription>Completa los datos del cliente. Solo el nombre es obligatorio.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 py-2">
          {/* Identificación */}
          <div className="space-y-3">
            <p className="text-sm font-semibold">Identificación</p>
            <div className="space-y-1.5">
              <Label htmlFor="name">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input id="name" placeholder="Empresa ABC, S.R.L." {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select
                  value={watch('type')}
                  onValueChange={(v) => setValue('type', v as 'company' | 'individual')}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">Empresa</SelectItem>
                    <SelectItem value="individual">Persona física</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rnc">RNC / Cédula</Label>
                <Input
                  id="rnc"
                  placeholder="131XXXXXX o 00XXXXXXXXX"
                  {...register('rnc', { onBlur: (e) => void buscarRnc(e.target.value) })}
                />
                {errors.rnc && <p className="text-xs text-destructive">{errors.rnc.message}</p>}
                {rncStatus && (
                  <p className={`text-xs ${rncStatus.kind === 'warn' ? 'text-amber-600' : 'text-muted-foreground'}`}>
                    {rncStatus.text}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Contacto */}
          <div className="space-y-3 border-t pt-5">
            <p className="text-sm font-semibold">Contacto</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input id="email" type="email" placeholder="correo@empresa.com" {...register('email')} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">Teléfono</Label>
                <Input id="phone" placeholder="809-000-0000" {...register('phone')} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="city">Ciudad</Label>
                <Input id="city" placeholder="Santo Domingo" {...register('city')} />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="address">Dirección</Label>
                <Input id="address" placeholder="Calle principal #1, Sector..." {...register('address')} />
              </div>
            </div>
          </div>

          {/* Contacto adicional */}
          <div className="space-y-3 border-t pt-5">
            <p className="text-sm font-semibold">Contacto adicional</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="contactName">Persona de contacto</Label>
                <Input id="contactName" placeholder="Juan Pérez" {...register('contactName')} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="contactPhone">Teléfono de contacto</Label>
                <Input id="contactPhone" placeholder="829-000-0000" {...register('contactPhone')} />
              </div>
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-3 border-t pt-5">
            <p className="text-sm font-semibold">Notas</p>
            <textarea
              id="notes"
              {...register('notes')}
              rows={3}
              placeholder="Información adicional..."
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            />
          </div>

          {serverError && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
              {serverError}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Crear cliente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
