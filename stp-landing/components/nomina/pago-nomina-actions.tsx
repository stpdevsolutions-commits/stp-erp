'use client'

import { useState } from 'react'
import { MoreHorizontal, Pencil, Trash2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PagoNominaForm } from './pago-nomina-form'
import {
  updatePayrollEntry,
  deletePayrollEntry,
  type PayrollInput,
} from '@/lib/actions/payroll'
import type { Collaborator, PayrollEntry, Project } from '@/lib/types'

export function PagoNominaActions({
  entry,
  collaborators,
  projects,
  canDelete,
}: {
  entry: PayrollEntry
  collaborators: Collaborator[]
  projects: Project[]
  canDelete: boolean
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(input: PayrollInput) {
    setServerError(null)
    const result = await updatePayrollEntry(entry.id, input)
    if (!result.ok) {
      setServerError(result.error ?? 'Error desconocido')
      return
    }
    setEditOpen(false)
  }

  async function marcarPagado() {
    setLoading(true)
    await updatePayrollEntry(entry.id, { status: 'paid' })
    setLoading(false)
  }

  async function handleDelete() {
    setLoading(true)
    setServerError(null)
    const result = await deletePayrollEntry(entry.id)
    setLoading(false)
    if (!result.ok) {
      setServerError(result.error ?? 'Error al eliminar')
      return
    }
    setDeleteOpen(false)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
          <MoreHorizontal className="size-4" />
          <span className="sr-only">Acciones</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {entry.status !== 'paid' && (
            <DropdownMenuItem onClick={marcarPagado} disabled={loading}>
              <CheckCircle2 className="size-4" />
              Marcar como pagado
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            Editar
          </DropdownMenuItem>
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="size-4" />
                Eliminar
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o)
          if (!o) setServerError(null)
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar pago {entry.number}</DialogTitle>
            <DialogDescription>
              Al cambiar los importes se recalcula el gasto de mano de obra asociado.
            </DialogDescription>
          </DialogHeader>
          <PagoNominaForm
            entry={entry}
            collaborators={collaborators}
            projects={projects}
            onSubmit={onSubmit}
            onCancel={() => setEditOpen(false)}
            serverError={serverError}
            submitLabel="Guardar cambios"
          />
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar pago {entry.number}</DialogTitle>
            <DialogDescription>
              Se borrará el registro de nómina
              {entry.expenseId ? ' y su gasto de mano de obra' : ''}. Esta acción no se puede
              deshacer.
            </DialogDescription>
          </DialogHeader>

          {serverError && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
              {serverError}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              {loading ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
