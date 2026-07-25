'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { GitBranch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { reviseQuote } from '@/lib/actions/quotes'

export function ReviseQuoteButton({
  quoteId,
  quoteNumber,
}: {
  quoteId: string
  quoteNumber: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRevise() {
    setLoading(true)
    setError(null)
    const result = await reviseQuote(quoteId)
    setLoading(false)
    if (!result.ok) {
      setError(result.error ?? 'Error al crear la revisión')
      return
    }
    setOpen(false)
    if (result.quoteId) {
      router.push(`/dashboard/cotizaciones/${result.quoteId}`)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <GitBranch className="size-4 mr-1.5" />
        Nueva revisión
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crear nueva revisión</DialogTitle>
            <DialogDescription>
              Se creará una copia editable de{' '}
              <span className="font-semibold text-foreground">{quoteNumber}</span> como nueva
              revisión en estado borrador. La cotización actual se conserva como documento
              histórico y quedará marcada como reemplazada. Podrás ajustar la revisión antes de
              reenviarla al cliente.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">{error}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={handleRevise} disabled={loading}>
              {loading ? 'Creando...' : 'Crear revisión'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
