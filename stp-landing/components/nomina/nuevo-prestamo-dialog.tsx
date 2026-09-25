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
import { createCollaboratorLoan } from '@/lib/actions/payroll'
import type { Collaborator } from '@/lib/types'

const schema = z.object({
  collaboratorId: z.string().min(1, 'Selecciona un colaborador'),
  amount: z.string().refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, 'Debe ser mayor a 0'),
  installmentAmount: z.string().refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, 'Debe ser mayor a 0'),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function NuevoPrestamoDialog({ collaborators }: { collaborators: Collaborator[] }) {
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const collaboratorId = watch('collaboratorId')
  const selectedName = collaborators.find((c) => c.id === collaboratorId)

  async function onSubmit(data: FormValues) {
    setServerError(null)
    const result = await createCollaboratorLoan({
      collaboratorId: data.collaboratorId,
      amount: parseFloat(data.amount),
      installmentAmount: parseFloat(data.installmentAmount),
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
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { reset(); setServerError(null) } }}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus className="size-4 mr-1" />
        Nuevo préstamo
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo préstamo a colaborador</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Colaborador <span className="text-destructive">*</span></Label>
            <Select
              value={collaboratorId ?? ''}
              onValueChange={(v) => v && setValue('collaboratorId', v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleccionar colaborador">
                  {selectedName ? `${selectedName.code} — ${selectedName.firstName} ${selectedName.lastName}` : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {collaborators.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.code} — {c.firstName} {c.lastName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.collaboratorId && <p className="text-xs text-destructive">{errors.collaboratorId.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Monto del préstamo (DOP) <span className="text-destructive">*</span></Label>
              <Input id="amount" type="number" min="0" step="0.01" {...register('amount')} />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="installmentAmount">Cuota por pago (DOP) <span className="text-destructive">*</span></Label>
              <Input id="installmentAmount" type="number" min="0" step="0.01" {...register('installmentAmount')} />
              {errors.installmentAmount && <p className="text-xs text-destructive">{errors.installmentAmount.message}</p>}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            La cuota se descuenta automáticamente de cada pago de nómina de este colaborador hasta saldar el préstamo.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas</Label>
            <Input id="notes" placeholder="Motivo del préstamo" {...register('notes')} />
          </div>

          {serverError && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">{serverError}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Guardando...' : 'Crear préstamo'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
