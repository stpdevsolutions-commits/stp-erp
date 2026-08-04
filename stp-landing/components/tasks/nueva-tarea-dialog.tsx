'use client'

import { useMemo, useState } from 'react'
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
import { BuscadorSelect } from '@/components/ui/buscador-select'
import type { Collaborator, Project, User } from '@/lib/types'
import { createTask } from '@/lib/actions/tasks'
import {
  AsignadoSelect,
  SIN_ASIGNAR,
  parseAsignacion,
} from '@/components/tasks/asignado-select'

const schema = z.object({
  title: z.string().min(2, 'Mínimo 2 caracteres').max(200),
  projectId: z.string().min(1, 'Selecciona un proyecto'),
  description: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'review', 'done', 'cancelled']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  dueDate: z.string().optional(),
  /** Valor combinado del selector: `col:<id>`, `user:<id>` o SIN_ASIGNAR. */
  asignado: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

const STATUS_LABELS = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  review: 'En revisión',
  done: 'Completada',
  cancelled: 'Cancelada',
}

const PRIORITY_LABELS = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
}

export function NuevaTareaDialog({
  projects,
  collaborators,
  users,
}: {
  projects: Project[]
  collaborators: Collaborator[]
  users: User[]
}) {
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  /**
   * El cliente no viaja al servidor: la tarea cuelga del proyecto. Está aquí solo
   * para acotar la lista de proyectos, que es lo que pesa cuando hay muchos.
   */
  const [clienteId, setClienteId] = useState('')

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { status: 'pending', priority: 'medium', asignado: SIN_ASIGNAR },
  })

  const projectId = watch('projectId')

  /**
   * Los clientes salen de los propios proyectos en vez de pedirse aparte: un
   * cliente sin proyectos no puede recibir una tarea, así que ofrecerlo solo
   * llevaría a un callejón sin salida.
   */
  const clientes = useMemo(() => {
    const porId = new Map<string, string>()
    for (const p of projects) {
      if (p.client) porId.set(p.client.id, p.client.name)
    }
    return [...porId.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'))
  }, [projects])

  const proyectosVisibles = useMemo(
    () => (clienteId ? projects.filter((p) => p.clientId === clienteId) : projects),
    [projects, clienteId],
  )

  const opcionesProyecto = useMemo(
    () =>
      proyectosVisibles.map((p) => ({
        value: p.id,
        label: p.name,
        hint: clienteId ? p.code : `${p.code} · ${p.client?.name ?? 'sin cliente'}`,
      })),
    [proyectosVisibles, clienteId],
  )

  async function onSubmit(data: FormValues) {
    setServerError(null)
    const asignacion = parseAsignacion(data.asignado)
    const result = await createTask({
      title: data.title,
      projectId: data.projectId,
      description: data.description || undefined,
      status: data.status,
      priority: data.priority,
      dueDate: data.dueDate || undefined,
      assignedToId: asignacion.assignedToId ?? undefined,
      collaboratorId: asignacion.collaboratorId ?? undefined,
    })
    if (!result.ok) {
      setServerError(result.error ?? 'Error desconocido')
      return
    }
    reset()
    setClienteId('')
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) {
          reset()
          setClienteId('')
          setServerError(null)
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4 mr-1" />
        Nueva tarea
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva tarea</DialogTitle>
          <DialogDescription>Asigna la tarea a un proyecto y define su prioridad.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="title">
              Título <span className="text-destructive">*</span>
            </Label>
            <Input id="title" placeholder="Descripción breve de la tarea" {...register('title')} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cliente">Cliente</Label>
            <BuscadorSelect
              id="cliente"
              opciones={clientes}
              value={clienteId}
              placeholder="Todos los clientes"
              vacio="Ningún cliente coincide"
              onValueChange={(v) => {
                setClienteId(v)
                // El proyecto elegido puede ser de otro cliente: se limpia para no
                // guardar en silencio una tarea en el proyecto equivocado.
                const actual = projects.find((p) => p.id === projectId)
                if (v && actual && actual.clientId !== v) setValue('projectId', '')
              }}
            />
            <p className="text-xs text-muted-foreground">
              Opcional. Solo sirve para acortar la lista de proyectos.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="proyecto">
              Proyecto <span className="text-destructive">*</span>
            </Label>
            <BuscadorSelect
              id="proyecto"
              opciones={opcionesProyecto}
              value={projectId ?? ''}
              placeholder="Buscar proyecto por nombre o código"
              vacio={clienteId ? 'Este cliente no tiene proyectos' : 'Ningún proyecto coincide'}
              onValueChange={(v) => setValue('projectId', v, { shouldValidate: true })}
            />
            {errors.projectId && (
              <p className="text-xs text-destructive">{errors.projectId.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

            <div className="space-y-1.5">
              <Label>Prioridad</Label>
              <Select
                value={watch('priority')}
                onValueChange={(v) => v && setValue('priority', v as FormValues['priority'])}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dueDate">Fecha límite</Label>
              <Input id="dueDate" type="date" {...register('dueDate')} />
            </div>

            <div className="space-y-1.5">
              <Label>Asignado a</Label>
              <AsignadoSelect
                value={watch('asignado') ?? SIN_ASIGNAR}
                onValueChange={(v) => setValue('asignado', v)}
                collaborators={collaborators}
                users={users}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Descripción</Label>
            <textarea
              id="description"
              {...register('description')}
              rows={3}
              placeholder="Detalles adicionales..."
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
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
              {isSubmitting ? 'Guardando...' : 'Crear tarea'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
