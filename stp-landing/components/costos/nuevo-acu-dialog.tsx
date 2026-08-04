'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { createAcu } from '@/lib/actions/costs'
import type { AcuTrade, Unit } from '@/lib/types'
import { TRADE_LABELS } from './acu-labels'

const schema = z.object({
  name: z.string().min(3, 'Mínimo 3 caracteres'),
  unitId: z.string().min(1, 'Requerida'),
  trade: z.enum(['electrical', 'civil', 'mechanical', 'other']),
  chapter: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function NuevoAcuDialog({
  units,
  chapters,
}: {
  units: Unit[]
  /** Capítulos ya usados, para no escribir el mismo de tres maneras distintas. */
  chapters: string[]
}) {
  const router = useRouter()
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
    defaultValues: { unitId: '', trade: 'electrical' },
  })

  const unitId = watch('unitId')
  const trade = watch('trade')
  const unitSeleccionada = units.find((u) => u.id === unitId)

  async function onSubmit(data: FormValues) {
    setServerError(null)
    const result = await createAcu({
      name: data.name,
      unitId: data.unitId,
      trade: data.trade as AcuTrade,
      chapter: data.chapter?.trim() || undefined,
      description: data.description?.trim() || undefined,
      notes: data.notes?.trim() || undefined,
    })
    if (!result.ok) {
      setServerError(result.error ?? 'Error desconocido')
      return
    }
    reset({ unitId: '', trade: 'electrical' })
    setOpen(false)
    // La partida nace vacía: lo siguiente siempre es cargarle la receta.
    if (result.id) router.push(`/dashboard/costos/acus/${result.id}`)
  }

  const noUnits = units.length === 0

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) {
          reset({ unitId: '', trade: 'electrical' })
          setServerError(null)
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4 mr-1" />
        Nueva partida
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva partida (ACU)</DialogTitle>
          <DialogDescription>
            Primero la cabecera; los insumos se cargan después, en el detalle.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-full space-y-1.5">
              <Label htmlFor="acu-name">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input
                id="acu-name"
                placeholder="Salida eléctrica de tomacorriente"
                {...register('name')}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>
                Unidad de la partida <span className="text-destructive">*</span>
              </Label>
              <Select value={unitId} onValueChange={(v) => v && setValue('unitId', v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={noUnits ? 'No hay unidades' : 'Seleccionar...'}>
                    {unitSeleccionada ? `${unitSeleccionada.code} — ${unitSeleccionada.name}` : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {units
                    .filter((u) => u.isActive)
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.code} — {u.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {errors.unitId && <p className="text-xs text-destructive">{errors.unitId.message}</p>}
              <p className="text-muted-foreground text-xs">
                El &quot;por m2&quot; de &quot;RD$450 por m2&quot;, no la unidad de sus insumos.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Oficio</Label>
              <Select
                value={trade}
                onValueChange={(v) => v && setValue('trade', v as FormValues['trade'])}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TRADE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-full space-y-1.5">
              <Label htmlFor="acu-chapter">Capítulo</Label>
              <Input
                id="acu-chapter"
                list="acu-chapters"
                placeholder="1. CANALIZACIONES"
                {...register('chapter')}
              />
              <datalist id="acu-chapters">
                {chapters.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div className="col-span-full space-y-1.5">
              <Label htmlFor="acu-description">Descripción</Label>
              <Input
                id="acu-description"
                placeholder="Alcance de la partida, criterio de medición..."
                {...register('description')}
              />
            </div>

            <div className="col-span-full space-y-1.5">
              <Label htmlFor="acu-notes">Notas</Label>
              <Input id="acu-notes" {...register('notes')} />
            </div>
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
            <Button type="submit" disabled={isSubmitting || noUnits}>
              {isSubmitting ? 'Creando...' : 'Crear partida'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
