'use client'

import { useState } from 'react'
import { Ban } from 'lucide-react'
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
import { voidMaterialPrice } from '@/lib/actions/costs'

/**
 * Anular es la única forma de corregir un precio: el historial es append-only, así que
 * la fila se queda con su motivo y deja de contar en las agregaciones.
 */
export function AnularPrecioButton({
  priceId,
  materialId,
  detail,
  fromExpense,
}: {
  priceId: string
  materialId: string
  detail: string
  fromExpense?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleVoid() {
    setSaving(true)
    setError(null)
    const result = await voidMaterialPrice(priceId, materialId, reason)
    setSaving(false)
    if (!result.ok) {
      setError(result.error ?? 'Error al anular')
      return
    }
    setReason('')
    setOpen(false)
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Anular precio"
        onClick={() => setOpen(true)}
      >
        <Ban className="size-3.5" />
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) {
            setError(null)
            setReason('')
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Anular este precio?</DialogTitle>
            <DialogDescription>
              {detail}. El precio deja de contar en el vigente y en los promedios, pero la fila se
              conserva en el historial con el motivo.
            </DialogDescription>
          </DialogHeader>

          {fromExpense && (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              Este precio viene de un gasto registrado. Si el gasto sigue existiendo con su
              cantidad y unitario, conviene corregir el gasto en vez de anular aquí: al editarlo
              se genera el precio correcto automáticamente.
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="reason">
              Motivo <span className="text-destructive">*</span>
            </Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Error de dedo: eran RD$41.20"
            />
            <p className="text-muted-foreground text-xs">
              Mínimo 5 caracteres. Sin motivo el historial no se puede auditar.
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleVoid}
              disabled={saving || reason.trim().length < 5}
            >
              {saving ? 'Anulando...' : 'Anular precio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
