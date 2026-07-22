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
import type { Client } from '@/lib/types'
import { createProject } from '@/lib/actions/projects'

const schema = z
  .object({
    name: z.string().min(2, 'Mínimo 2 caracteres').max(200),
    clientId: z.string().min(1, 'Selecciona un cliente'),
    description: z.string().optional(),
    status: z.enum(['draft', 'active', 'on_hold', 'completed', 'cancelled']),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    budget: z.string().optional(),
  })
  .refine(
    (d) => !d.startDate || !d.endDate || d.endDate >= d.startDate,
    { message: 'La fecha de fin debe ser posterior al inicio', path: ['endDate'] },
  )

type FormValues = z.infer<typeof schema>

const STATUS_LABELS = {
  draft: 'Pendiente',
  active: 'En curso',
  on_hold: 'En pausa',
  completed: 'Completado',
  cancelled: 'Cancelado',
}

export function NuevoProyectoDialog({ clients }: { clients: Client[] }) {
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [budgetDisplay, setBudgetDisplay] = useState('')

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { status: 'draft' },
  })

  const clientId = watch('clientId')
  const selectedClientName = clients.find((c) => c.id === clientId)?.name

  async function onSubmit(data: FormValues) {
    setServerError(null)
    const result = await createProject({
      name: data.name,
      clientId: data.clientId,
      description: data.description || undefined,
      status: data.status,
      startDate: data.startDate || undefined,
      endDate: data.endDate || undefined,
      budget: data.budget ? parseFloat(data.budget) : undefined,
    })
    if (!result.ok) {
      setServerError(result.error ?? 'Error desconocido')
      return
    }
    reset()
    setBudgetDisplay('')
    setOpen(false)
  }

  function handleBudgetChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
    setBudgetDisplay(raw)
    setValue('budget', raw)
  }

  function handleBudgetBlur() {
    const num = parseFloat(budgetDisplay)
    if (budgetDisplay && !isNaN(num)) {
      setBudgetDisplay(num.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
      setValue('budget', String(num))
    }
  }

  function handleBudgetFocus() {
    setBudgetDisplay(budgetDisplay.replace(/[^\d.]/g, ''))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) {
          reset()
          setBudgetDisplay('')
          setServerError(null)
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4 mr-1" />
        Nuevo proyecto
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo proyecto</DialogTitle>
          <DialogDescription>
            El código se genera automáticamente (PRJ-YYYY-NNN).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">
              Nombre <span className="text-destructive">*</span>
            </Label>
            <Input id="name" placeholder="Instalación eléctrica industrial" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                Cliente <span className="text-destructive">*</span>
              </Label>
              <Select
                value={clientId ?? ''}
                onValueChange={(v) => v && setValue('clientId', v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar cliente">
                    {selectedClientName}
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

            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select
                value={watch('status')}
                onValueChange={(v) => v && setValue('status', v as FormValues['status'])}
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
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Descripción</Label>
            <textarea
              id="description"
              {...register('description')}
              rows={3}
              placeholder="Descripción del proyecto..."
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="startDate">Fecha de inicio</Label>
              <Input id="startDate" type="date" {...register('startDate')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="endDate">Fecha de fin</Label>
              <Input id="endDate" type="date" {...register('endDate')} />
              {errors.endDate && (
                <p className="text-xs text-destructive">{errors.endDate.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="budget">Presupuesto (DOP)</Label>
            <input type="hidden" {...register('budget')} />
            <Input
              id="budget"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={budgetDisplay}
              onChange={handleBudgetChange}
              onBlur={handleBudgetBlur}
              onFocus={handleBudgetFocus}
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
              {isSubmitting ? 'Guardando...' : 'Crear proyecto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
