'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { deleteUnit, deleteMaterialCategory } from '@/lib/actions/costs'

/**
 * Borrado de una unidad o categoría. La API rechaza el borrado si algo la está usando,
 * así que el error que devuelve es la explicación útil y se muestra tal cual.
 */
export function CatalogoRowActions({
  kind,
  id,
  label,
}: {
  kind: 'unit' | 'category'
  id: string
  label: string
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    const result = kind === 'unit' ? await deleteUnit(id) : await deleteMaterialCategory(id)
    setDeleting(false)
    if (!result.ok) {
      setError(result.error ?? 'Error al eliminar')
      return
    }
    setOpen(false)
  }

  const noun = kind === 'unit' ? 'unidad' : 'categoría'

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        title={`Eliminar ${noun}`}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-3.5" />
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setError(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Eliminar {noun}?</DialogTitle>
            <DialogDescription>
              <strong>{label}</strong>. Si está en uso el sistema no lo permitirá; en ese caso
              desactívala en vez de borrarla.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
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
