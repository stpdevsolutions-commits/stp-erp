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
import { createSupplier } from '@/lib/actions/suppliers'

const CATEGORY_LABELS = {
  materials: 'Materiales',
  equipment: 'Equipos',
  services: 'Servicios',
  subcontract: 'Subcontrato',
  other: 'Otro',
}

const schema = z.object({
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
})

type FormValues = z.infer<typeof schema>

export function NuevoProveedorDialog() {
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
    defaultValues: { category: 'other' },
  })

  async function onSubmit(data: FormValues) {
    setServerError(null)
    const result = await createSupplier({
      ...data,
      rnc: data.rnc || undefined,
      email: data.email || undefined,
      phone: data.phone || undefined,
      city: data.city || undefined,
      address: data.address || undefined,
      contactName: data.contactName || undefined,
      contactPhone: data.contactPhone || undefined,
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
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) { reset(); setServerError(null) }
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4 mr-1" />
        Nuevo proveedor
      </DialogTrigger>

      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo proveedor</DialogTitle>
          <DialogDescription>Registra un proveedor de materiales, equipos o servicios.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="prov-name">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input id="prov-name" placeholder="Ferretería Americana" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Select
                value={watch('category')}
                onValueChange={(v) => v && setValue('category', v as FormValues['category'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prov-rnc">RNC / Cédula</Label>
              <Input id="prov-rnc" placeholder="131XXXXXX" {...register('rnc')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prov-email">Correo electrónico</Label>
              <Input id="prov-email" type="email" {...register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prov-phone">Teléfono</Label>
              <Input id="prov-phone" placeholder="809-000-0000" {...register('phone')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prov-city">Ciudad</Label>
              <Input id="prov-city" placeholder="Santo Domingo" {...register('city')} />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="prov-address">Dirección</Label>
              <Input id="prov-address" {...register('address')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prov-contactName">Persona de contacto</Label>
              <Input id="prov-contactName" {...register('contactName')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prov-contactPhone">Tel. de contacto</Label>
              <Input id="prov-contactPhone" {...register('contactPhone')} />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="prov-notes">Notas</Label>
              <Input id="prov-notes" placeholder="Condiciones, garantía..." {...register('notes')} />
            </div>
          </div>

          {serverError && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">{serverError}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Crear proveedor'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
