'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateCompanySettings } from '@/lib/actions/settings'
import type { CompanyFormData } from '@/lib/actions/settings'

const schema = z.object({
  name:     z.string().min(2, 'Mínimo 2 caracteres'),
  shortName: z.string().min(1, 'Requerido').max(10),
  rnc:      z.string().regex(/^\d{9}$/, 'RNC debe tener 9 dígitos'),
  address1: z.string().min(2, 'Requerido'),
  address2: z.string().min(2, 'Requerido'),
  phones:   z.string().min(2, 'Requerido'),
  email:    z.string().email('Correo inválido'),
  website:  z.string().min(2, 'Requerido'),
})

export function CompanyForm({ defaults }: { defaults: CompanyFormData }) {
  const [success, setSuccess] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CompanyFormData>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  })

  async function onSubmit(data: CompanyFormData) {
    setServerError(null)
    setSuccess(false)
    const result = await updateCompanySettings(data)
    if (!result.ok) {
      setServerError(result.error ?? 'Error desconocido')
      return
    }
    setSuccess(true)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2 space-y-1.5">
          <Label htmlFor="name">Nombre de la empresa</Label>
          <Input id="name" {...register('name')} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="shortName">Nombre corto / siglas</Label>
          <Input id="shortName" {...register('shortName')} placeholder="STP" />
          {errors.shortName && <p className="text-xs text-destructive">{errors.shortName.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rnc">RNC (9 dígitos)</Label>
          <Input id="rnc" {...register('rnc')} placeholder="132943058" maxLength={9} />
          {errors.rnc && <p className="text-xs text-destructive">{errors.rnc.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="address1">Dirección línea 1</Label>
          <Input id="address1" {...register('address1')} placeholder="Calle, número, sector" />
          {errors.address1 && <p className="text-xs text-destructive">{errors.address1.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="address2">Dirección línea 2</Label>
          <Input id="address2" {...register('address2')} placeholder="Ciudad, provincia, país" />
          {errors.address2 && <p className="text-xs text-destructive">{errors.address2.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phones">Teléfonos</Label>
          <Input id="phones" {...register('phones')} placeholder="809-000-0000 / 809-000-0001" />
          {errors.phones && <p className="text-xs text-destructive">{errors.phones.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Correo electrónico</Label>
          <Input id="email" type="email" {...register('email')} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="website">Sitio web</Label>
          <Input id="website" {...register('website')} placeholder="stpsoluciones.com" />
          {errors.website && <p className="text-xs text-destructive">{errors.website.message}</p>}
        </div>
      </div>

      {serverError && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{serverError}</p>
      )}
      {success && (
        <p className="text-sm text-green-700 bg-green-50 rounded-md px-3 py-2">Datos guardados correctamente.</p>
      )}

      <Button type="submit" size="sm" disabled={isSubmitting}>
        {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
      </Button>
    </form>
  )
}
