'use client'

import { useEffect, useMemo, useState } from 'react'
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
import { addAcuItem, updateAcuItem } from '@/lib/actions/costs'
import type { AcuItem, AcuItemPayload, Material, Unit } from '@/lib/types'
import { BASIS_LABELS, KIND_LABELS } from './acu-labels'

const hasNum = (v?: string) => Boolean(v) && !isNaN(parseFloat(v as string))
const num = (v?: string) => (hasNum(v) ? parseFloat(v as string) : undefined)

const schema = z
  .object({
    kind: z.enum(['material', 'labor', 'equipment']),
    materialId: z.string().optional(),
    description: z.string().optional(),
    unitId: z.string().optional(),
    quantity: z.string().optional(),
    unitCost: z.string().optional(),
    basis: z.enum(['yield', 'pct_materials']),
    pct: z.string().optional(),
    wastePct: z.string().optional(),
    notes: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    const add = (path: 'materialId' | 'description' | 'quantity' | 'unitCost' | 'pct', message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message })

    if (d.kind === 'material') {
      if (!d.materialId && !hasNum(d.unitCost)) {
        add('materialId', 'Elige un material del catálogo o escribe un costo unitario propio')
      }
      if (!hasNum(d.quantity) || parseFloat(d.quantity as string) <= 0) {
        add('quantity', 'Indica cuánto se consume por unidad de la partida')
      }
      return
    }

    if (!d.description?.trim()) add('description', 'Obligatoria en mano de obra y equipo')

    if (d.basis === 'pct_materials') {
      if (!hasNum(d.pct)) add('pct', 'Requerido con base "% sobre materiales"')
      return
    }
    if (!hasNum(d.quantity)) add('quantity', 'Indica el rendimiento por unidad de partida')
    if (!hasNum(d.unitCost)) add('unitCost', 'Indica la tarifa')
  })

type FormValues = z.infer<typeof schema>

/** Unidad base de una unidad: la suya propia si ya es base. */
const baseOf = (u: Unit) => u.baseUnitId ?? u.id

function toDefaults(item?: AcuItem): FormValues {
  return {
    kind: item?.kind ?? 'material',
    materialId: item?.materialId ?? '',
    description: item?.description ?? '',
    unitId: item?.unitId ?? '',
    quantity: item?.quantity != null ? String(item.quantity) : '',
    unitCost: item?.unitCost != null ? String(item.unitCost) : '',
    basis: item?.basis ?? 'yield',
    pct: item?.pct != null ? String(item.pct) : '',
    wastePct: item?.wastePct ? String(item.wastePct) : '',
    notes: item?.notes ?? '',
  }
}

export function AcuItemDialog({
  acuId,
  item,
  materials,
  units,
  open,
  onOpenChange,
}: {
  acuId: string
  /** Sin `item` se crea una línea nueva. */
  item?: AcuItem
  materials: Material[]
  units: Unit[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState('')

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(item),
  })

  const kind = watch('kind')
  const basis = watch('basis')
  const materialId = watch('materialId')
  const unitId = watch('unitId')

  const esMaterial = kind === 'material'
  const esPct = !esMaterial && basis === 'pct_materials'

  const material = materials.find((m) => m.id === materialId)
  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units])

  /**
   * La unidad de la línea se hereda del material al elegirlo. Se escribe con `setValue`
   * en un efecto en vez de pasarla como `value` al campo: así el input no cambia de
   * no-controlado a controlado a mitad de vida (mismo motivo que en el desglose de Gastos).
   */
  useEffect(() => {
    if (esMaterial && material && !unitId) setValue('unitId', material.unitId)
  }, [esMaterial, material, unitId, setValue])

  /**
   * En una línea de material solo se admiten unidades convertibles a la del material:
   * guardar pies contra un catálogo en metros daría un unitario sin sentido y la API
   * lo rechaza. Mejor no ofrecerlas siquiera.
   */
  const unidadesDisponibles = useMemo(() => {
    const activas = units.filter((u) => u.isActive || u.id === unitId)
    if (!esMaterial || !material) return activas
    const destino = unitById.get(material.unitId)
    if (!destino) return activas
    return activas.filter((u) => baseOf(u) === baseOf(destino))
  }, [units, esMaterial, material, unitById, unitId])

  const materialesFiltrados = useMemo(() => {
    const activos = materials.filter((m) => m.isActive || m.id === materialId)
    const q = filtro.trim().toLowerCase()
    if (!q) return activos.slice(0, 200)
    return activos
      .filter((m) => `${m.code} ${m.name} ${m.brand ?? ''}`.toLowerCase().includes(q))
      .slice(0, 200)
  }, [materials, filtro, materialId])

  async function onSubmit(data: FormValues) {
    setServerError(null)

    const payload: AcuItemPayload = {
      kind: data.kind,
      description: data.description?.trim() || undefined,
      notes: data.notes?.trim() || undefined,
    }

    // Los `null` son intencionados: al editar, un campo ausente conserva el valor
    // anterior, así que quitarle el material a una línea (o pasarla a porcentaje) exige
    // mandar el hueco explícito. Si no, quedan datos colgando de la forma anterior.
    if (data.kind === 'material') {
      payload.materialId = data.materialId || null
      payload.unitId = data.unitId || undefined
      payload.quantity = num(data.quantity)
      payload.unitCost = num(data.unitCost) ?? null
      payload.wastePct = num(data.wastePct) ?? 0
    } else {
      payload.materialId = null
      payload.basis = data.basis
      if (data.basis === 'pct_materials') {
        payload.pct = num(data.pct)
        payload.quantity = 0
        payload.unitCost = null
        payload.wastePct = 0
      } else {
        payload.unitId = data.unitId || undefined
        payload.quantity = num(data.quantity)
        payload.unitCost = num(data.unitCost) ?? null
        payload.wastePct = num(data.wastePct) ?? 0
      }
    }

    const result = item
      ? await updateAcuItem(acuId, item.id, payload)
      : await addAcuItem(acuId, payload)

    if (!result.ok) {
      setServerError(result.error ?? 'Error desconocido')
      return
    }
    reset(item ? undefined : toDefaults())
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) {
          reset(toDefaults(item))
          setServerError(null)
          setFiltro('')
        }
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? 'Editar insumo' : 'Añadir insumo'}</DialogTitle>
          <DialogDescription>
            Lo que consume <strong>una</strong> unidad de la partida.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={kind}
                onValueChange={(v) => v && setValue('kind', v as FormValues['kind'])}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(KIND_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!esMaterial && (
              <div className="space-y-1.5">
                <Label>Cómo se valora</Label>
                <Select
                  value={basis}
                  onValueChange={(v) => v && setValue('basis', v as FormValues['basis'])}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(BASIS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {esMaterial && (
              <div className="col-span-full space-y-1.5">
                <Label>
                  Material del catálogo{' '}
                  <span className="text-muted-foreground text-xs font-normal">
                    (su precio vigente valora la línea)
                  </span>
                </Label>
                <Input
                  placeholder="Filtrar por nombre, código o marca..."
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  className="h-8 text-sm"
                />
                <Select
                  value={materialId || '__none__'}
                  onValueChange={(v) => setValue('materialId', v === '__none__' ? '' : (v ?? ''))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar material">
                      {material ? `${material.code} — ${material.name}` : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin material (costo propio)</SelectItem>
                    {materialesFiltrados.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.code} — {m.name}
                        {m.brand ? ` · ${m.brand}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.materialId && (
                  <p className="text-xs text-destructive">{errors.materialId.message}</p>
                )}
              </div>
            )}

            <div className="col-span-full space-y-1.5">
              <Label htmlFor="acu-item-desc">
                Descripción{' '}
                {!esMaterial && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="acu-item-desc"
                placeholder={
                  esMaterial ? 'Opcional: si se deja vacía se usa el nombre del material' : 'Electricista (jornal)'
                }
                {...register('description')}
              />
              {errors.description && (
                <p className="text-xs text-destructive">{errors.description.message}</p>
              )}
            </div>

            {esPct ? (
              <div className="col-span-full space-y-1.5">
                <Label htmlFor="acu-item-pct">
                  Porcentaje sobre materiales (%) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="acu-item-pct"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="20"
                  {...register('pct')}
                />
                {errors.pct && <p className="text-xs text-destructive">{errors.pct.message}</p>}
                <p className="text-muted-foreground text-xs">
                  Se aplica sobre el costo de materiales de esta misma partida. Es lo que se usa
                  cuando todavía no hay un rendimiento medido.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="acu-item-qty">
                    {esMaterial ? 'Cantidad' : 'Rendimiento'}{' '}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="acu-item-qty"
                    type="number"
                    min="0"
                    step="any"
                    placeholder={esMaterial ? '3.2' : '0.125'}
                    {...register('quantity')}
                  />
                  {errors.quantity && (
                    <p className="text-xs text-destructive">{errors.quantity.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>Unidad del insumo</Label>
                  <Select
                    value={unitId || '__none__'}
                    onValueChange={(v) => setValue('unitId', v === '__none__' ? '' : (v ?? ''))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="—">
                        {unitId ? (unitById.get(unitId)?.code ?? undefined) : undefined}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {unidadesDisponibles.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.code} — {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {esMaterial && material && (
                    <p className="text-muted-foreground text-xs">
                      El catálogo tiene este material en{' '}
                      <strong>{unitById.get(material.unitId)?.code ?? '—'}</strong>. Solo se
                      ofrecen unidades convertibles.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="acu-item-cost">
                    {esMaterial ? 'Costo unitario propio (RD$)' : 'Tarifa (RD$)'}
                    {!esMaterial && <span className="text-destructive"> *</span>}
                  </Label>
                  <Input
                    id="acu-item-cost"
                    type="number"
                    min="0"
                    step="0.0001"
                    placeholder={esMaterial ? 'Vacío = precio del catálogo' : '0.00'}
                    {...register('unitCost')}
                  />
                  {errors.unitCost && (
                    <p className="text-xs text-destructive">{errors.unitCost.message}</p>
                  )}
                  {esMaterial && (
                    <p className="text-muted-foreground text-xs">
                      Si se escribe, gana sobre el precio vigente del catálogo.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="acu-item-waste">Desperdicio (%)</Label>
                  <Input
                    id="acu-item-waste"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="0"
                    {...register('wastePct')}
                  />
                  <p className="text-muted-foreground text-xs">
                    Recortes, empalmes, roturas. Sube la cantidad, no el precio.
                  </p>
                </div>
              </>
            )}

            <div className="col-span-full space-y-1.5">
              <Label htmlFor="acu-item-notes">Notas</Label>
              <Input id="acu-item-notes" {...register('notes')} />
            </div>
          </div>

          {serverError && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
              {serverError}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : item ? 'Guardar' : 'Añadir'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Botón + diálogo para añadir una línea nueva a la receta. */
export function AgregarInsumoButton({
  acuId,
  materials,
  units,
}: {
  acuId: string
  materials: Material[]
  units: Unit[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4 mr-1" />
        Añadir insumo
      </Button>
      <AcuItemDialog
        acuId={acuId}
        materials={materials}
        units={units}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
