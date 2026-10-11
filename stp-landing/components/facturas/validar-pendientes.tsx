'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { validatePendingFiscalInvoices } from '@/lib/actions/fiscal-invoices'

interface Progress {
  checked: number
  validated: number
  remaining: number
  unresolved: { id: string; ncf: string; reason: string }[]
}

/**
 * Valida en la DGII, de tanda en tanda, todas las facturas que nunca se han consultado.
 * Cada tanda son 10 consultas seguidas; la pantalla muestra el avance y se puede detener.
 */
export function ValidarPendientesButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const cancel = useRef(false)

  async function run() {
    setRunning(true)
    setDone(false)
    setError(null)
    cancel.current = false
    const acc: Progress = { checked: 0, validated: 0, remaining: 0, unresolved: [] }
    setProgress({ ...acc })
    const skip: string[] = []

    while (!cancel.current) {
      const res = await validatePendingFiscalInvoices(skip)
      if (!res.ok || !res.data) {
        setError(res.error ?? 'No se pudo consultar la DGII')
        break
      }
      const d = res.data
      acc.checked += d.checked
      acc.validated += d.validated
      acc.unresolved.push(...d.unresolved)
      skip.push(...d.unresolved.map((u) => u.id))
      acc.remaining = Math.max(0, d.remaining - d.unresolved.length)
      setProgress({ ...acc, unresolved: [...acc.unresolved] })
      if (d.checked === 0 || acc.remaining === 0) {
        setDone(true)
        break
      }
    }
    setRunning(false)
    router.refresh()
  }

  function close(v: boolean) {
    if (!v && running) cancel.current = true
    setOpen(v)
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <ShieldCheck className="size-4" />
        Validar pendientes
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Validar pendientes en la DGII</DialogTitle>
            <DialogDescription>
              Consulta en el portal de la DGII todas las facturas que todavía no se han validado y guarda el
              resultado en cada una. Tarda unos segundos por tanda; puedes detenerlo cuando quieras.
            </DialogDescription>
          </DialogHeader>

          {progress && (
            <div className="space-y-2 text-sm">
              <p>
                Consultadas: <b>{progress.checked}</b> · Validadas: <b>{progress.validated}</b> · Por consultar:{' '}
                <b>{progress.remaining}</b>
              </p>
              {progress.unresolved.length > 0 && (
                <div className="rounded-md border p-2 max-h-48 overflow-auto text-xs space-y-1">
                  <p className="font-medium">Sin resultado ({progress.unresolved.length}):</p>
                  {progress.unresolved.map((u) => (
                    <p key={u.id}>
                      <span className="font-mono">{u.ncf}</span> — {u.reason}
                    </p>
                  ))}
                </div>
              )}
              {done && <p className="text-emerald-600">Listo: no quedan facturas por consultar.</p>}
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            {running ? (
              <Button variant="outline" onClick={() => (cancel.current = true)}>
                <Loader2 className="size-4 animate-spin mr-2" />
                Detener
              </Button>
            ) : (
              <Button onClick={run}>{progress ? 'Continuar' : 'Empezar'}</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
