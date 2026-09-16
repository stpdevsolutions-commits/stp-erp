'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
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
import type { Project, Sprint } from '@/lib/types'
import { createSprint, updateSprint } from '@/lib/actions/sprints'
import { SPRINT_STATUS_LABELS } from './labels'

/** Igual que en los diálogos de ticket: el Select de base-ui no acepta
 * value="", así que "sin proyecto concreto" (etapa transversal) usa este
 * centinela y se convierte a null/undefined al enviar. */
const MULTI = '__multi__'

const schema = z
  .object({
    name: z.string().min(2, 'Mínimo 2 caracteres').max(120),
    goal: z.string().optional(),
    startDate: z.string().min(1, 'Requerido'),
    endDate: z.string().min(1, 'Requerido'),
    status: z.enum(['planned', 'active', 'done', 'cancelled']),
    projectId: z.string().optional(),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: 'El fin no puede ser antes del inicio',
    path: ['endDate'],
  })

type FormValues = z.infer<typeof schema>

export function EtapaDialog({
  projects,
  sprint,
  open,
  onOpenChange,
}: {
  projects: Project[]
  sprint?: Sprint
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const editing = Boolean(sprint)
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
      name: sprint?.name ?? '',
      goal: sprint?.goal ?? '',
      startDate: sprint?.startDate ?? '',
      endDate: sprint?.endDate ?? '',
      status: sprint?.status ?? 'planned',
      projectId: sprint?.projectId ?? MULTI,
    },
  })

  function close() {
    setServerError(null)
    onOpenChange(false)
  }

  async function onSubmit(data: FormValues) {
    setServerError(null)
    const payload = {
      name: data.name,
      goal: data.goal || null,
      startDate: data.startDate,
      endDate: data.endDate,
      status: data.status,
      projectId: data.projectId === MULTI ? null : data.projectId,
    }
    const result = editing
      ? await updateSprint(sprint!.id, payload)
      : await createSprint(payload)
    if (!result.ok) {
      setServerError(result.error ?? 'Error desconocido')
      return
    }
    if (!editing) reset()
    close()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar etapa' : 'Nueva etapa'}</DialogTitle>
          <DialogDescription>
            Una etapa agrupa tickets entre dos fechas para ver el avance del desarrollo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="etapa-name">
              Nombre <span className="text-destructive">*</span>
            </Label>
            <Input id="etapa-name" placeholder="Ej. Identidad visual FiscoRD" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="etapa-start">
                Inicio <span className="text-destructive">*</span>
              </Label>
              <Input id="etapa-start" type="date" {...register('startDate')} />
              {errors.startDate && (
                <p className="text-xs text-destructive">{errors.startDate.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="etapa-end">
                Fin <span className="text-destructive">*</span>
              </Label>
              <Input id="etapa-end" type="date" {...register('endDate')} />
              {errors.endDate && (
                <p className="text-xs text-destructive">{errors.endDate.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  {Object.entries(SPRINT_STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Proyecto</Label>
              <Select
                value={watch('projectId')}
                onValueChange={(v) => v && setValue('projectId', v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={MULTI}>Varios proyectos</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="etapa-goal">Objetivo</Label>
            <textarea
              id="etapa-goal"
              {...register('goal')}
              rows={3}
              placeholder="Qué se quiere lograr en esta etapa (no la lista de tareas)."
              className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          {serverError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {serverError}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear etapa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
