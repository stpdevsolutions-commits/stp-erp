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
import { createUnit } from '@/lib/actions/costs'
import type { Unit, UnitKind } from '@/lib/types'

const KINDS: { value: UnitKind; label: string }[] = [
  { value: 'count', label: 'Conteo' },
  { value: 'length', label: 'Longitud' },
  { value: 'area', label: 'Área' },
  { value: 'volume', label: 'Volumen' },
  { value: 'mass', label: 'Masa' },
  { value: 'time', label: 'Tiempo' },
  { value: 'other', label: 'Otro' },
]

const schema = z
  .object({
    code: z.string().min(1, 'Requerido').max(20),
    name: z.string().min(2, 'Mínimo 2 caracteres'),
    kind: z.enum(['count', 'length', 'area', 'volume', 'mass', 'time', 'other']),
    baseUnitId: z.string().optional(),
    factor: z.string().optional(),
  })
  .refine(
    (d) => {
      const hasBase = Boolean(d.baseUnitId)
      const hasFactor = Boolean(d.factor && parseFloat(d.factor) > 0)
      return hasBase === hasFactor
    },
    { message: 'Unidad base y factor van juntos o ninguno', path: ['factor'] },
  )

type FormValues = z.infer<typeof schema>

export function NuevaUnidadDialog({ units }: { units: Unit[] }) {
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
    defaultValues: { kind: 'count', baseUnitId: '' },
  })

  const kind = watch('kind')
  const baseUnitId = watch('baseUnitId')

  // Solo tiene sentido convertir hacia una unidad del mismo tipo.
  const baseOptions = units.filter((u) => u.kind === kind && !u.baseUnitId)

  async function onSubmit(data: FormValues) {
    setServerError(null)
    const result = await createUnit({
      code: data.code,
      name: data.name,
      kind: data.kind as UnitKind,
      baseUnitId: data.baseUnitId || undefined,
      factor: data.factor ? parseFloat(data.factor) : undefined,
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
        if (!o) {
          reset()
          setServerError(null)
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus className="size-4 mr-1" />
        Nueva unidad
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva unidad de medida</DialogTitle>
          <DialogDescription>
            Solo si falta alguna: ya vienen cargadas las 25 habituales con sus conversiones.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="code">
                Código <span className="text-destructive">*</span>
              </Label>
              <Input id="code" placeholder="ml" {...register('code')} />
              {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="name">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input id="name" placeholder="Mililitro" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="col-span-full space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={kind}
                onValueChange={(v) => {
                  if (!v) return
                  setValue('kind', v as UnitKind)
                  // Cambiar de tipo invalida la base elegida.
                  setValue('baseUnitId', '')
                  setValue('factor', '')
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Unidad base</Label>
              <Select
                value={baseUnitId || '__none__'}
                onValueChange={(v) => setValue('baseUnitId', v === '__none__' ? '' : (v ?? ''))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Ninguna</SelectItem>
                  {baseOptions.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.code} — {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="factor">Factor</Label>
              <Input
                id="factor"
                type="number"
                min="0"
                step="0.00000001"
                placeholder="0.001"
                {...register('factor')}
              />
              {errors.factor && <p className="text-xs text-destructive">{errors.factor.message}</p>}
            </div>
          </div>

          <p className="text-muted-foreground text-xs">
            El factor es cuánto vale una unidad de esta en la base. Ejemplo: 1 quintal = 45.359237 kg.
          </p>

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
              {isSubmitting ? 'Guardando...' : 'Crear unidad'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
