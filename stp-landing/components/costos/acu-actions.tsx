'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ListTree, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { deleteAcu, updateAcu } from '@/lib/actions/costs'
import type { Acu, Unit } from '@/lib/types'
import { TRADE_LABELS } from './acu-labels'

const schema = z.object({
  name: z.string().min(3, 'Mínimo 3 caracteres'),
  unitId: z.string().min(1, 'Requerida'),
  trade: z.enum(['electrical', 'civil', 'mechanical', 'other']),
  chapter: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.enum(['true', 'false']),
})

type FormValues = z.infer<typeof schema>

export function AcuActions({
  acu,
  units,
  chapters = [],
  showView = true,
  redirectOnDelete = false,
}: {
  acu: Acu
  units: Unit[]
  chapters?: string[]
  showView?: boolean
  /** En el detalle, tras borrar hay que salir de una página que ya no existe. */
  redirectOnDelete?: boolean
}) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const defaults: FormValues = {
    name: acu.name,
    unitId: acu.unitId,
    trade: acu.trade,
    chapter: acu.chapter ?? '',
    description: acu.description ?? '',
    notes: acu.notes ?? '',
    isActive: acu.isActive ? 'true' : 'false',
  }

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults })

  const unitId = watch('unitId')
  const unitSeleccionada = units.find((u) => u.id === unitId)

  async function onSubmit(data: FormValues) {
    setServerError(null)
    const result = await updateAcu(acu.id, {
      name: data.name,
      unitId: data.unitId,
      trade: data.trade,
      chapter: data.chapter?.trim() || undefined,
      description: data.description?.trim() || undefined,
      notes: data.notes?.trim() || undefined,
      isActive: data.isActive === 'true',
    })
    if (!result.ok) {
      setServerError(result.error ?? 'Error')
      return
    }
    setEditOpen(false)
  }

  async function handleDelete() {
    setDeleting(true)
    setDeleteError(null)
    const result = await deleteAcu(acu.id)
    setDeleting(false)
    if (!result.ok) {
      setDeleteError(result.error ?? 'Error al eliminar')
      return
    }
    setDeleteOpen(false)
    if (redirectOnDelete) router.push('/dashboard/costos/acus')
  }

  const numItems = acu.items?.length ?? 0

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {showView && (
            <DropdownMenuItem render={<Link href={`/dashboard/costos/acus/${acu.id}`} />}>
              <ListTree className="size-3.5 mr-2" /> Ver receta
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="size-3.5 mr-2" /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-3.5 mr-2" /> Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o)
          if (!o) {
            reset(defaults)
            setServerError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar partida</DialogTitle>
            <DialogDescription className="font-mono text-xs">{acu.code}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="col-span-full space-y-1.5">
                <Label>
                  Nombre <span className="text-destructive">*</span>
                </Label>
                <Input {...register('name')} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Unidad de la partida</Label>
                <Select value={unitId} onValueChange={(v) => v && setValue('unitId', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {unitSeleccionada
                        ? `${unitSeleccionada.code} — ${unitSeleccionada.name}`
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.code} — {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.unitId && (
                  <p className="text-xs text-destructive">{errors.unitId.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Oficio</Label>
                <Select
                  value={watch('trade')}
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

              <div className="space-y-1.5">
                <Label>Capítulo</Label>
                <Input list={`acu-chapters-${acu.id}`} {...register('chapter')} />
                <datalist id={`acu-chapters-${acu.id}`}>
                  {chapters.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Select
                  value={watch('isActive')}
                  onValueChange={(v) => v && setValue('isActive', v as 'true' | 'false')}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Activa</SelectItem>
                    <SelectItem value="false">Inactiva</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-full space-y-1.5">
                <Label>Descripción</Label>
                <Input {...register('description')} />
              </div>

              <div className="col-span-full space-y-1.5">
                <Label>Notas</Label>
                <Input {...register('notes')} />
              </div>
            </div>

            {serverError && (
              <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
                {serverError}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando...' : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o)
          if (!o) setDeleteError(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Eliminar la partida?</DialogTitle>
            <DialogDescription>
              Se eliminará <strong>{acu.name}</strong> ({acu.code})
              {numItems > 0 && ` y sus ${numItems} línea(s) de receta`}. Si solo quieres dejar de
              usarla, márcala como inactiva y conservarás el análisis.
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
              {deleteError}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
