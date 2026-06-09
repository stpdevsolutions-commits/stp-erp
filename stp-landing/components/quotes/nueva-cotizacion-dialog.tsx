'use client'

import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2 } from 'lucide-react'
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
import type { Client, Project } from '@/lib/types'
import { createQuote } from '@/lib/actions/quotes'

// ── Schema ────────────────────────────────────────────────────────────────────

const itemSchema = z.object({
  description: z.string().min(1, 'Requerido'),
  unit: z.string().optional(),
  quantity: z
    .string()
    .min(1, 'Requerido')
    .refine((v) => parseFloat(v) > 0, 'Debe ser > 0'),
  unitPrice: z
    .string()
    .min(1, 'Requerido')
    .refine((v) => parseFloat(v) >= 0, 'Debe ser ≥ 0'),
  discountPct: z
    .string()
    .optional()
    .refine((v) => !v || (parseFloat(v) >= 0 && parseFloat(v) <= 100), 'Entre 0 y 100'),
})

const schema = z.object({
  title: z.string().min(2, 'Mínimo 2 caracteres').max(200),
  clientId: z.string().min(1, 'Selecciona un cliente'),
  projectId: z.string().optional(),
  status: z.enum(['draft', 'sent', 'approved', 'rejected', 'expired']),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, 'Agrega al menos un ítem'),
})

type FormValues = z.infer<typeof schema>

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS = {
  draft: 'Borrador',
  sent: 'Enviada',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  expired: 'Expirada',
}

const UNITS = [
  { value: 'unid', label: 'Unid.' },
  { value: 'm', label: 'm (Metro)' },
  { value: 'm2', label: 'm² (M. cuadrado)' },
  { value: 'm3', label: 'm³ (M. cúbico)' },
  { value: 'kg', label: 'kg (Kilogramo)' },
  { value: 'lb', label: 'lb (Libra)' },
  { value: 'hr', label: 'hr (Hora)' },
  { value: 'dia', label: 'día' },
  { value: 'pie', label: 'pie' },
  { value: 'pulg', label: 'pulg. (Pulgada)' },
  { value: 'gl', label: 'gl (Galón)' },
  { value: 'lt', label: 'lt (Litro)' },
  { value: 'rollo', label: 'rollo' },
  { value: 'caja', label: 'caja' },
  { value: 'juego', label: 'juego' },
  { value: 'servicio', label: 'servicio' },
  { value: 'otro', label: 'otro' },
]

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })
const ITBIS_RATE = 0.18

// ── Component ─────────────────────────────────────────────────────────────────

export function NuevaCotizacionDialog({
  clients,
  projects,
}: {
  clients: Client[]
  projects: Project[]
}) {
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [applyITBIS, setApplyITBIS] = useState(true)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      status: 'draft',
      items: [{ description: '', unit: '', quantity: '1', unitPrice: '', discountPct: '' }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  const watchedItems = watch('items')
  const subtotal = watchedItems.reduce((sum, item) => {
    const qty = parseFloat(item.quantity) || 0
    const price = parseFloat(item.unitPrice) || 0
    const disc = parseFloat(item.discountPct || '0') || 0
    return sum + qty * price * (1 - disc / 100)
  }, 0)
  const itbis = applyITBIS ? subtotal * ITBIS_RATE : 0
  const total = subtotal + itbis

  const clientId = watch('clientId')
  const projectId = watch('projectId')

  const selectedClient = clients.find((c) => c.id === clientId)
  const filteredProjects = projects.filter((p) => p.clientId === clientId)
  const selectedProject = filteredProjects.find((p) => p.id === projectId)

  function handleClientChange(newClientId: string | null) {
    if (!newClientId) return
    setValue('clientId', newClientId)
    setValue('projectId', undefined)
  }

  function handleProjectChange(newProjectId: string | null) {
    if (!newProjectId || newProjectId === '__none__') {
      setValue('projectId', undefined)
    } else {
      setValue('projectId', newProjectId)
    }
  }

  async function onSubmit(data: FormValues) {
    setServerError(null)
    const result = await createQuote({
      title: data.title,
      clientId: data.clientId,
      projectId: data.projectId || undefined,
      status: data.status,
      validUntil: data.validUntil || undefined,
      notes: data.notes || undefined,
      taxRate: applyITBIS ? 18 : 0,
      items: data.items.map((item) => ({
        description: item.description,
        unit: item.unit || undefined,
        quantity: parseFloat(item.quantity),
        unitPrice: parseFloat(item.unitPrice),
        discountPct: parseFloat(item.discountPct || '0') || 0,
      })),
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
          setApplyITBIS(true)
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4 mr-1" />
        Nueva cotización
      </DialogTrigger>

      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva cotización</DialogTitle>
          <DialogDescription>
            El número se genera automáticamente (COT-YYYY-NNN).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 py-2">
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="title">
                Título <span className="text-destructive">*</span>
              </Label>
              <Input id="title" placeholder="Propuesta de instalación eléctrica" {...register('title')} />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>

            {/* Client selector (primary) */}
            <div className="space-y-1.5">
              <Label>
                Cliente <span className="text-destructive">*</span>
              </Label>
              <Select
                value={clientId ?? ''}
                onValueChange={handleClientChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar cliente">
                    {selectedClient?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.clientId && (
                <p className="text-xs text-destructive">{errors.clientId.message}</p>
              )}
            </div>

            {/* Project selector (optional, filtered by client) */}
            <div className="space-y-1.5">
              <Label>Proyecto (opcional)</Label>
              <Select
                value={projectId ?? '__none__'}
                onValueChange={handleProjectChange}
                disabled={!clientId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin proyecto">
                    {selectedProject ? `${selectedProject.code} — ${selectedProject.name}` : 'Sin proyecto'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sin proyecto —</SelectItem>
                  {filteredProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select
                value={watch('status')}
                onValueChange={(v) => v && setValue('status', v as FormValues['status'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="validUntil">Válida hasta</Label>
              <Input id="validUntil" type="date" {...register('validUntil')} />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="notes">Notas</Label>
              <Input id="notes" placeholder="Condiciones, garantía..." {...register('notes')} />
            </div>
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                Ítems <span className="text-destructive">*</span>
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ description: '', unit: '', quantity: '1', unitPrice: '', discountPct: '' })}
              >
                <Plus className="size-3.5 mr-1" />
                Agregar ítem
              </Button>
            </div>

            {errors.items?.root && (
              <p className="text-xs text-destructive">{errors.items.root.message}</p>
            )}

            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Descripción</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground w-28">Unidad</th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground w-18">Cant.</th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground w-28">Precio unit.</th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground w-18">Desc. %</th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground w-28">Total</th>
                    <th className="w-9" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {fields.map((field, index) => {
                    const qty = parseFloat(watchedItems[index]?.quantity) || 0
                    const price = parseFloat(watchedItems[index]?.unitPrice) || 0
                    const disc = parseFloat(watchedItems[index]?.discountPct || '0') || 0
                    const rowTotal = qty * price * (1 - disc / 100)
                    const unitVal = watchedItems[index]?.unit || ''

                    return (
                      <tr key={field.id}>
                        <td className="px-3 py-1.5">
                          <Input
                            className="h-8 border-0 shadow-none focus-visible:ring-0 px-0 text-sm"
                            placeholder="Descripción del ítem"
                            {...register(`items.${index}.description`)}
                          />
                          {errors.items?.[index]?.description && (
                            <p className="text-xs text-destructive">
                              {errors.items[index].description?.message}
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <Select
                            value={unitVal || '__none__'}
                            onValueChange={(v) => {
                              if (!v) return
                              setValue(`items.${index}.unit`, v === '__none__' ? '' : v)
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs border-0 shadow-none focus:ring-0 px-0">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">—</SelectItem>
                              {UNITS.map((u) => (
                                <SelectItem key={u.value} value={u.value}>
                                  {u.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            min="0.01"
                            step="0.01"
                            className="h-8 border-0 shadow-none focus-visible:ring-0 px-0 text-right text-sm"
                            {...register(`items.${index}.quantity`)}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="h-8 border-0 shadow-none focus-visible:ring-0 px-0 text-right text-sm"
                            {...register(`items.${index}.unitPrice`)}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            className="h-8 border-0 shadow-none focus-visible:ring-0 px-0 text-right text-sm"
                            placeholder="0"
                            {...register(`items.${index}.discountPct`)}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {DOP.format(rowTotal)}
                        </td>
                        <td className="px-1 py-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => remove(index)}
                            disabled={fields.length === 1}
                          >
                            <Trash2 className="size-3.5 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* ITBIS toggle + Totals */}
            <div className="flex items-end justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
                <input
                  type="checkbox"
                  checked={applyITBIS}
                  onChange={(e) => setApplyITBIS(e.target.checked)}
                  className="rounded border-input"
                />
                Aplicar ITBIS (18%)
              </label>

              <div className="w-64 space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{DOP.format(subtotal)}</span>
                </div>
                {applyITBIS && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>ITBIS (18%)</span>
                    <span className="tabular-nums">{DOP.format(itbis)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t pt-1">
                  <span>Total</span>
                  <span className="tabular-nums">{DOP.format(total)}</span>
                </div>
              </div>
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Crear cotización'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
