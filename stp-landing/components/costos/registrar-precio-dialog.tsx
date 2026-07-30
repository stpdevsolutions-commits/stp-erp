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
import { addMaterialPrice } from '@/lib/actions/costs'
import type { PriceCurrency, PriceRegion, PriceSource, Supplier } from '@/lib/types'

const REGIONS: { value: PriceRegion; label: string }[] = [
  { value: 'santo_domingo', label: 'Santo Domingo' },
  { value: 'santiago_cibao', label: 'Santiago / Cibao' },
  { value: 'este_punta_cana', label: 'Este / Punta Cana' },
  { value: 'norte', label: 'Norte' },
  { value: 'sur', label: 'Sur' },
  { value: 'otra', label: 'Otra' },
]

const SOURCES: { value: PriceSource; label: string }[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'supplier_quote', label: 'Cotización de proveedor' },
  { value: 'external_ref', label: 'Referencia externa' },
]

const schema = z
  .object({
    price: z.string().refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, 'Número inválido'),
    currency: z.enum(['DOP', 'USD']),
    exchangeRate: z.string().optional(),
    itbisIncluded: z.enum(['true', 'false']),
    discountPct: z.string().optional(),
    supplierId: z.string().optional(),
    region: z.enum(['santo_domingo', 'santiago_cibao', 'este_punta_cana', 'norte', 'sur', 'otra']),
    date: z.string().min(1, 'Requerido'),
    leadTimeDays: z.string().optional(),
    minQuantity: z.string().optional(),
    source: z.enum(['manual', 'supplier_quote', 'external_ref']),
    notes: z.string().optional(),
  })
  .refine(
    (d) => d.currency === 'DOP' || (d.exchangeRate != null && parseFloat(d.exchangeRate) > 0),
    { message: 'La tasa de cambio es obligatoria si la moneda no es DOP', path: ['exchangeRate'] },
  )

type FormValues = z.infer<typeof schema>

/** Precio neto comparable, igual que lo calcula el servidor. Solo para la vista previa. */
function preview(d: {
  price: string
  currency: 'DOP' | 'USD'
  exchangeRate?: string
  itbisIncluded: 'true' | 'false'
  discountPct?: string
}): number | null {
  const price = parseFloat(d.price)
  if (isNaN(price)) return null
  const rate = d.currency === 'DOP' ? 1 : parseFloat(d.exchangeRate ?? '0')
  if (!rate || rate <= 0) return null
  const discount = parseFloat(d.discountPct ?? '0') || 0
  if (discount < 0 || discount >= 100) return null
  const itbis = d.itbisIncluded === 'true' ? 18 : 0
  return (price * rate * (1 - discount / 100)) / (1 + itbis / 100)
}

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

export function RegistrarPrecioDialog({
  materialId,
  materialName,
  unitCode,
  suppliers,
}: {
  materialId: string
  materialName: string
  unitCode?: string
  suppliers: Supplier[]
}) {
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
    defaultValues: {
      currency: 'DOP',
      itbisIncluded: 'false',
      region: 'santo_domingo',
      source: 'manual',
      discountPct: '0',
      date: new Date().toISOString().slice(0, 10),
    },
  })

  // Se observan los campos uno a uno en vez de `watch()` entero: el compilador de React
  // no puede memoizar el objeto completo y avisa por ello.
  const price = watch('price')
  const currency = watch('currency')
  const exchangeRate = watch('exchangeRate')
  const itbisIncluded = watch('itbisIncluded')
  const discountPct = watch('discountPct')
  const supplierId = watch('supplierId')
  const region = watch('region')
  const source = watch('source')

  const net = preview({ price, currency, exchangeRate, itbisIncluded, discountPct })

  async function onSubmit(data: FormValues) {
    setServerError(null)
    const result = await addMaterialPrice(materialId, {
      price: parseFloat(data.price),
      currency: data.currency as PriceCurrency,
      exchangeRate: data.exchangeRate ? parseFloat(data.exchangeRate) : undefined,
      itbisIncluded: data.itbisIncluded === 'true',
      discountPct: data.discountPct ? parseFloat(data.discountPct) : 0,
      supplierId: data.supplierId || undefined,
      region: data.region as PriceRegion,
      date: data.date,
      leadTimeDays: data.leadTimeDays ? parseInt(data.leadTimeDays) : undefined,
      minQuantity: data.minQuantity ? parseFloat(data.minQuantity) : undefined,
      source: data.source as PriceSource,
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
        if (!o) {
          reset()
          setServerError(null)
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4 mr-1" />
        Registrar precio
      </DialogTrigger>

      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar precio</DialogTitle>
          <DialogDescription>
            {materialName}
            {unitCode && ` · precio por ${unitCode}`}. Los precios no se editan ni se borran: si te
            equivocas, anula y registra de nuevo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="price">
                Precio unitario <span className="text-destructive">*</span>
              </Label>
              <Input id="price" type="number" min="0" step="0.0001" {...register('price')} />
              {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Moneda</Label>
              <Select
                value={currency}
                onValueChange={(v) => v && setValue('currency', v as 'DOP' | 'USD')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DOP">DOP — Pesos</SelectItem>
                  <SelectItem value="USD">USD — Dólares</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {currency !== 'DOP' && (
              <div className="space-y-1.5">
                <Label htmlFor="exchangeRate">
                  Tasa de cambio (DOP por {currency}){' '}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="exchangeRate"
                  type="number"
                  min="0"
                  step="0.0001"
                  {...register('exchangeRate')}
                />
                {errors.exchangeRate && (
                  <p className="text-xs text-destructive">{errors.exchangeRate.message}</p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>¿El precio trae ITBIS incluido?</Label>
              <Select
                value={itbisIncluded}
                onValueChange={(v) => v && setValue('itbisIncluded', v as 'true' | 'false')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">No, es sin ITBIS</SelectItem>
                  <SelectItem value="true">Sí, incluye 18%</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="discountPct">Descuento (%)</Label>
              <Input
                id="discountPct"
                type="number"
                min="0"
                max="99.99"
                step="0.01"
                {...register('discountPct')}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Proveedor</Label>
              <Select
                value={supplierId || '__none__'}
                onValueChange={(v) => setValue('supplierId', v === '__none__' ? '' : (v ?? ''))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin proveedor</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="date">
                Fecha del precio <span className="text-destructive">*</span>
              </Label>
              <Input id="date" type="date" {...register('date')} />
              {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Región</Label>
              <Select
                value={region}
                onValueChange={(v) => v && setValue('region', v as PriceRegion)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REGIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Origen del dato</Label>
              <Select
                value={source}
                onValueChange={(v) => v && setValue('source', v as FormValues['source'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="leadTimeDays">Tiempo de entrega (días)</Label>
              <Input id="leadTimeDays" type="number" min="0" step="1" {...register('leadTimeDays')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="minQuantity">Cantidad mínima</Label>
              <Input id="minQuantity" type="number" min="0" step="0.01" {...register('minQuantity')} />
            </div>

            <div className="col-span-full space-y-1.5">
              <Label htmlFor="notes">Notas</Label>
              <Input id="notes" placeholder="Nº de cotización, contacto..." {...register('notes')} />
            </div>
          </div>

          <div className="bg-muted/50 rounded-md px-3 py-2 text-sm">
            <span className="text-muted-foreground">Neto comparable: </span>
            <span className="font-mono font-medium">{net != null ? DOP.format(net) : '—'}</span>
            <span className="text-muted-foreground text-xs">
              {' '}
              (en pesos, con descuento, sin ITBIS){unitCode && ` por ${unitCode}`}
            </span>
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
              {isSubmitting ? 'Guardando...' : 'Registrar precio'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
