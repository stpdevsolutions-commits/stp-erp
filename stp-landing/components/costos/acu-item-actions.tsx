'use client'

import { useState } from 'react'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
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
import { deleteAcuItem } from '@/lib/actions/costs'
import type { AcuItem, Material, Unit } from '@/lib/types'
import { AcuItemDialog } from './acu-item-dialog'

export function AcuItemActions({
  acuId,
  item,
  label,
  materials,
  units,
}: {
  acuId: string
  item: AcuItem
  label: string
  materials: Material[]
  units: Unit[]
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    setDeleteError(null)
    const result = await deleteAcuItem(acuId, item.id)
    setDeleting(false)
    if (!result.ok) {
      setDeleteError(result.error ?? 'Error al eliminar')
      return
    }
    setDeleteOpen(false)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="size-3.5 mr-2" /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-3.5 mr-2" /> Quitar de la receta
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AcuItemDialog
        acuId={acuId}
        item={item}
        materials={materials}
        units={units}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <Dialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o)
          if (!o) setDeleteError(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Quitar el insumo?</DialogTitle>
            <DialogDescription>
              Se quitará <strong>{label}</strong> de la receta y el costo unitario de la partida
              bajará en consecuencia.
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
              {deleting ? 'Quitando...' : 'Quitar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
