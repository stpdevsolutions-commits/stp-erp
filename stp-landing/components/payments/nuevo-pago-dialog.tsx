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
import type { Client, Project } from '@/lib/types'
import { createPayment } from '@/lib/actions/payments'

const METHOD_LABELS = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  check: 'Cheque',
  card: 'Tarjeta',
  other: 'Otro',
}

const STATUS_LABELS = {
  pending: 'Pendiente',
  completed: 'Completado',
  failed: 'Fallido',
  refunded: 'Reembolsado',
}

const schema = z.object({
  clientId: z.string().min(1, 'Selecciona un cliente'),
  projectId: z.string().optional(),
  description: z.string().min(2, 'Mínimo 2 caracteres'),
  amount: z.string().min(1, 'Requerido').refine((v) => parseFloat(v) > 0, 'Debe ser > 0'),
  method: z.enum(['cash', 'transfer', 'check', 'card', 'other']),
  status: z.enum(['pending', 'completed', 'failed', 'refunded']),
  date: z.string().min(1, 'Requerido'),
  reference: z.string().optional(),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function NuevoPagoDialog({
  clients,
  projects,
}: {
  clients: Client[]
  projects: Project[]
}) {
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { method: 'transfer', status: 'completed', date: today, projectId: '' },
  })

  const clientId = watch('clientId')
  const selectedClientName = clients.find((c) => c.id === clientId)?.name

  const projectId = watch('projectId')
  const selectedProjectName = projects.find((p) => p.id === projectId)?.name

  const clientProjects = clientId
    ? projects.filter((p) => p.clientId === clientId)
    : projects

  async function onSubmit(data: FormValues) {
    setServerError(null)
    const result = await createPayment({
      clientId: data.clientId,
      projectId: data.projectId || undefined,
      description: data.description,
      amount: parseFloat(data.amount),
      method: data.method,
      status: data.status,
      date: data.date,
      reference: data.reference || undefined,
      notes: data.notes || undefined,
    })
    if (!result.ok) {
      setServerError(result.error ?? 'Error desconocido')
      return
    }
    reset({ method: 'transfer', status: 'completed', date: today, projectId: '' })
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) { reset({ method: 'transfer', status: 'completed', date: today, projectId: '' }); setServerError(null) }
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4 mr-1" />
        Nuevo pago
      </DialogTrigger>

      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo pago</DialogTitle>
          <DialogDescription>Registra un pago recibido de un cliente.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Cliente <span className="text-destructive">*</span></Label>
              <Select
                value={watch('clientId') ?? ''}
                onValueChange={(v) => {
                  if (!v) return
                  setValue('clientId', v)
                  setValue('projectId', '')
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar cliente">
                    {selectedClientName}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.clientId && <p className="text-xs text-destructive">{errors.clientId.message}</p>}
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label>Proyecto</Label>
              <Select
                value={watch('projectId') ?? ''}
                onValueChange={(v) => setValue('projectId', v ?? '')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="— Ninguno —">
                    {projectId ? selectedProjectName : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Ninguno —</SelectItem>
                  {clientProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="p-description">Descripción <span className="text-destructive">*</span></Label>
              <Input id="p-description" placeholder="Pago adelanto proyecto..." {...register('description')} />
              {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p-amount">Monto (RD$) <span className="text-destructive">*</span></Label>
              <Input id="p-amount" type="number" min="0.01" step="0.01" placeholder="0.00" {...register('amount')} />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p-date">Fecha <span className="text-destructive">*</span></Label>
              <Input id="p-date" type="date" {...register('date')} />
              {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Método</Label>
              <Select
                value={watch('method')}
                onValueChange={(v) => v && setValue('method', v as FormValues['method'])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(METHOD_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
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
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="p-reference">Referencia / Nro. transferencia</Label>
              <Input id="p-reference" placeholder="TRF-0001..." {...register('reference')} />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="p-notes">Notas</Label>
              <Input id="p-notes" {...register('notes')} />
            </div>
          </div>

          {serverError && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">{serverError}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Crear pago'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
