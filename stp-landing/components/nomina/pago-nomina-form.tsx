'use client'

import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Collaborator, PayrollEntry, Project } from '@/lib/types'
import type { PayrollInput } from '@/lib/actions/payroll'
import { calcularJornada, describirJornada } from '@/lib/jornada'

const SIN_PROYECTO = '__none__'

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

export const STATUS_LABELS: Record<PayrollEntry['status'], string> = {
  pending: 'Pendiente',
  paid: 'Pagado',
  cancelled: 'Anulado',
}

export const METHOD_LABELS: Record<PayrollEntry['method'], string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  check: 'Cheque',
  other: 'Otro',
}

export const PAYMENT_TYPE_LABELS: Record<PayrollEntry['paymentType'], string> = {
  day: 'Por día',
  m2: 'Por m²',
  m3: 'Por m³',
  ml: 'Por ml',
  lump_sum: 'P.A. (Partida Alzada)',
}

/** Etiqueta de la cantidad según el tipo de pago. lump_sum no usa este campo. */
const CANTIDAD_LABELS: Partial<Record<PayrollEntry['paymentType'], string>> = {
  day: 'Días',
  m2: 'Cantidad (m²)',
  m3: 'Cantidad (m³)',
  ml: 'Cantidad (ml)',
}

/** Etiqueta de la tarifa según el tipo de pago. lump_sum no usa este campo. */
const TARIFA_LABELS: Partial<Record<PayrollEntry['paymentType'], string>> = {
  day: 'Tarifa diaria',
  m2: 'Tarifa por m²',
  m3: 'Tarifa por m³',
  ml: 'Tarifa por ml',
}

// Los importes llegan del <input type="number"> como string; '' significa "vacío".
const money = z
  .string()
  .optional()
  .refine((v) => !v || (!isNaN(Number(v)) && Number(v) >= 0), 'Debe ser un número positivo')

const percent = z
  .string()
  .optional()
  .refine(
    (v) => !v || (!isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100),
    'Debe ser un porcentaje entre 0 y 100',
  )

const schema = z
  .object({
    collaboratorId: z.string().min(1, 'Selecciona un colaborador'),
    projectId: z.string().optional(),
    periodStart: z.string().min(1, 'Indica el inicio del período'),
    periodEnd: z.string().min(1, 'Indica el fin del período'),
    paymentType: z.enum(['day', 'm2', 'm3', 'ml', 'lump_sum']),
    daysWorked: money,
    dailyRate: money,
    overtimeAmount: money,
    bonuses: money,
    deductions: money,
    discountReason: z.string().optional(),
    retentionPercent: percent,
    status: z.enum(['pending', 'paid', 'cancelled']),
    method: z.enum(['cash', 'transfer', 'check', 'other']),
    paymentDate: z.string().optional(),
    reference: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine((d) => !d.periodEnd || !d.periodStart || d.periodEnd >= d.periodStart, {
    message: 'El fin del período no puede ser anterior a su inicio',
    path: ['periodEnd'],
  })

export type PayrollFormValues = z.infer<typeof schema>

const num = (v?: string) => (v && !isNaN(Number(v)) ? Number(v) : 0)
const str = (v?: number) => (v === undefined || v === null ? '' : String(v))

/** Mismo cálculo que hace el servidor; aquí solo sirve para previsualizar. */
function preview(v: PayrollFormValues) {
  const gross = num(v.daysWorked) * num(v.dailyRate) + num(v.overtimeAmount) + num(v.bonuses)
  // La retención es un % del bruto, igual que en el servidor (payroll-amounts.ts).
  const retention = (gross * num(v.retentionPercent)) / 100
  return { gross, retention, net: gross - num(v.deductions) - retention }
}

function toInput(v: PayrollFormValues): PayrollInput {
  return {
    collaboratorId: v.collaboratorId,
    projectId: !v.projectId || v.projectId === SIN_PROYECTO ? null : v.projectId,
    periodStart: v.periodStart,
    periodEnd: v.periodEnd,
    paymentType: v.paymentType,
    daysWorked: num(v.daysWorked),
    dailyRate: num(v.dailyRate),
    overtimeAmount: num(v.overtimeAmount),
    bonuses: num(v.bonuses),
    deductions: num(v.deductions),
    discountReason: v.discountReason || null,
    retentionPercent: num(v.retentionPercent),
    status: v.status,
    method: v.method,
    // Sin fecha de pago el servidor pone hoy al marcarlo como pagado.
    paymentDate: v.paymentDate || null,
    reference: v.reference || null,
    notes: v.notes || null,
  }
}

export function PagoNominaForm({
  entry,
  collaborators,
  projects,
  onSubmit,
  onCancel,
  serverError,
  submitLabel,
}: {
  entry?: PayrollEntry
  collaborators: Collaborator[]
  projects: Project[]
  onSubmit: (input: PayrollInput) => Promise<void>
  onCancel: () => void
  serverError: string | null
  submitLabel: string
}) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PayrollFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      collaboratorId: entry?.collaboratorId ?? '',
      projectId: entry?.projectId ?? SIN_PROYECTO,
      periodStart: entry?.periodStart?.slice(0, 10) ?? '',
      periodEnd: entry?.periodEnd?.slice(0, 10) ?? '',
      paymentType: entry?.paymentType ?? 'day',
      daysWorked: str(entry?.daysWorked),
      dailyRate: str(entry?.dailyRate),
      overtimeAmount: str(entry?.overtimeAmount),
      bonuses: str(entry?.bonuses),
      deductions: str(entry?.deductions),
      discountReason: entry?.discountReason ?? '',
      retentionPercent: str(entry?.retentionPercent),
      status: entry?.status ?? 'pending',
      method: entry?.method ?? 'cash',
      paymentDate: entry?.paymentDate?.slice(0, 10) ?? '',
      reference: entry?.reference ?? '',
      notes: entry?.notes ?? '',
    },
  })

  const values = watch()
  const collaboratorId = values.collaboratorId
  const collaborator = collaborators.find((c) => c.id === collaboratorId)
  const project = projects.find((p) => p.id === values.projectId)
  const { gross, retention, net } = preview(values)

  // Al elegir colaborador se propone su tarifa diaria; el usuario la puede pisar y
  // queda congelada en el pago (si mañana sube la tarifa, este pago no cambia).
  // Solo aplica a pago por día: para m²/m³/ml/P.A. no hay tarifa por defecto
  // todavía, se escribe cada vez.
  useEffect(() => {
    if (values.paymentType !== 'day') return
    if (!collaborator?.dailyRate) return
    if (values.dailyRate) return
    setValue('dailyRate', String(collaborator.dailyRate))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collaboratorId, values.paymentType])

  const jornada = values.paymentType === 'day' ? calcularJornada(values.periodStart, values.periodEnd) : null

  /**
   * El período propone los días: L-V completos, sábado medio, domingo fuera
   * (se paga como extra). Se recalcula cada vez que cambian las fechas, incluso
   * si ya había un número escrito: si alguien corrige el período, el dato viejo
   * es justamente el que no hay que conservar. Queda editable para ausencias.
   * Solo aplica a pago por día: por ajuste (m²/m³/ml) la cantidad no tiene
   * relación con el período, y P.A. no usa cantidad.
   */
  useEffect(() => {
    if (!jornada) return
    setValue('daysWorked', String(jornada.dias))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.periodStart, values.periodEnd, values.paymentType])

  // P.A.: la cantidad queda fija en 1 y oculta — lo que se escribe a mano es
  // directamente el monto, en el campo de tarifa.
  useEffect(() => {
    if (values.paymentType === 'lump_sum') setValue('daysWorked', '1')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.paymentType])

  // Al CAMBIAR a m²/m³/ml, la cantidad que hubiera (días calculados del período, o el
  // "1" de P.A.) no tiene relación con el nuevo tipo — se limpia para que la persona
  // escriba el número real en vez de arrastrar el de otro tipo sin darse cuenta. Solo
  // en un cambio real: `prevPaymentType` evita que dispare al abrir el formulario para
  // editar un pago que YA es de este tipo, que borraría la cantidad guardada.
  const prevPaymentType = useRef(values.paymentType)
  useEffect(() => {
    const prev = prevPaymentType.current
    prevPaymentType.current = values.paymentType
    if (prev === values.paymentType) return
    if (values.paymentType !== 'day' && values.paymentType !== 'lump_sum') {
      setValue('daysWorked', '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.paymentType])

  return (
    <form
      onSubmit={handleSubmit(async (data) => onSubmit(toInput(data)))}
      className="space-y-4 py-2"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>
            Colaborador <span className="text-destructive">*</span>
          </Label>
          <Select
            value={values.collaboratorId}
            onValueChange={(v) => v && setValue('collaboratorId', v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Seleccionar colaborador">
                {collaborator ? `${collaborator.firstName} ${collaborator.lastName}` : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {collaborators.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                  {c.position ? ` — ${c.position}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.collaboratorId && (
            <p className="text-xs text-destructive">{errors.collaboratorId.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Proyecto</Label>
          <Select
            value={values.projectId ?? SIN_PROYECTO}
            onValueChange={(v) => v && setValue('projectId', v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Sin proyecto">
                {project ? `${project.code} — ${project.name}` : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SIN_PROYECTO}>Sin proyecto</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Con proyecto, al marcarlo pagado se registra el gasto de mano de obra.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="periodStart">
            Período desde <span className="text-destructive">*</span>
          </Label>
          <Input id="periodStart" type="date" {...register('periodStart')} />
          {errors.periodStart && (
            <p className="text-xs text-destructive">{errors.periodStart.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="periodEnd">
            Período hasta <span className="text-destructive">*</span>
          </Label>
          <Input id="periodEnd" type="date" {...register('periodEnd')} />
          {errors.periodEnd && <p className="text-xs text-destructive">{errors.periodEnd.message}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Tipo de pago</Label>
        <Select
          value={values.paymentType}
          onValueChange={(v) => v && setValue('paymentType', v as PayrollFormValues['paymentType'])}
        >
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PAYMENT_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {jornada && (
        <p className="text-xs text-muted-foreground">
          Según el período: <strong className="text-foreground">{jornada.dias}</strong> días ·{' '}
          {describirJornada(jornada)}
        </p>
      )}

      <div className={`grid grid-cols-2 gap-3 ${values.paymentType === 'lump_sum' ? 'sm:grid-cols-3' : 'sm:grid-cols-4'}`}>
        {values.paymentType === 'lump_sum' ? (
          <div className="space-y-1.5 col-span-2 sm:col-span-1">
            <Label htmlFor="dailyRate">Monto (P.A.)</Label>
            <Input id="dailyRate" type="number" step="0.01" min="0" {...register('dailyRate')} />
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="daysWorked">{CANTIDAD_LABELS[values.paymentType]}</Label>
              <Input
                id="daysWorked"
                type="number"
                step={values.paymentType === 'day' ? '0.5' : '0.01'}
                min="0"
                {...register('daysWorked')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dailyRate">{TARIFA_LABELS[values.paymentType]}</Label>
              <Input id="dailyRate" type="number" step="0.01" min="0" {...register('dailyRate')} />
            </div>
          </>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="overtimeAmount">Horas extra</Label>
          <Input
            id="overtimeAmount"
            type="number"
            step="0.01"
            min="0"
            {...register('overtimeAmount')}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bonuses">Bonos</Label>
          <Input id="bonuses" type="number" step="0.01" min="0" {...register('bonuses')} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="deductions">Descuentos / avances</Label>
            <Input id="deductions" type="number" step="0.01" min="0" {...register('deductions')} />
          </div>

          {num(values.deductions) > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="discountReason">Motivo del descuento</Label>
              <Input
                id="discountReason"
                placeholder="Avance en efectivo, herramienta, préstamo…"
                {...register('discountReason')}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="retentionPercent">Retención (%)</Label>
            <Input
              id="retentionPercent"
              type="number"
              step="0.01"
              min="0"
              max="100"
              placeholder="0"
              {...register('retentionPercent')}
            />
            {errors.retentionPercent ? (
              <p className="text-xs text-destructive">{errors.retentionPercent.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Porcentaje del bruto que se retiene. Déjalo en 0 si no aplica.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Bruto</span>
            <span className="tabular-nums">{DOP.format(gross)}</span>
          </div>
          {num(values.deductions) > 0 && (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Descuentos</span>
              <span className="tabular-nums">− {DOP.format(num(values.deductions))}</span>
            </div>
          )}
          {retention > 0 && (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Retención ({num(values.retentionPercent)}%)</span>
              <span className="tabular-nums">− {DOP.format(retention)}</span>
            </div>
          )}
          <div className="flex items-center justify-between font-semibold">
            <span>Neto a pagar</span>
            <span className={`tabular-nums ${net < 0 ? 'text-destructive' : ''}`}>
              {DOP.format(net)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Estado</Label>
          <Select
            value={values.status}
            onValueChange={(v) => v && setValue('status', v as PayrollFormValues['status'])}
          >
            <SelectTrigger className="w-full">
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
          <Label>Método</Label>
          <Select
            value={values.method}
            onValueChange={(v) => v && setValue('method', v as PayrollFormValues['method'])}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(METHOD_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="paymentDate">Fecha de pago</Label>
          <Input id="paymentDate" type="date" {...register('paymentDate')} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reference">Referencia</Label>
        <Input id="reference" placeholder="Nº de cheque, transferencia…" {...register('reference')} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notas</Label>
        <textarea
          id="notes"
          {...register('notes')}
          rows={2}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
        />
      </div>

      {serverError && (
        <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
          {serverError}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}
