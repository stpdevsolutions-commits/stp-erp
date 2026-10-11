'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Camera, CheckCircle2, Loader2, PenLine, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FacturaForm, type SavedSummary } from '@/components/facturas/factura-form'
import { QrReader } from '@/components/facturas/qr-reader'
import { scanFiscalInvoice, scanQrText } from '@/lib/actions/fiscal-invoices'
import type { ScanResult } from '@/lib/fiscal-invoices'
import type { Project } from '@/lib/types'

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

type Phase =
  | { kind: 'idle' }
  | { kind: 'qr' }
  | { kind: 'reading'; what: string }
  | { kind: 'error'; message: string; file: File | null }
  | { kind: 'form'; run: number; file: File | null; scan: ScanResult | null }
  | { kind: 'saved'; summary: SavedSummary }

/**
 * Pantalla móvil de "STP Facturas": escanear la foto (IA) o leer el QR del e-CF, revisar lo que
 * se llenó solo, elegir el proyecto y guardar. Es la pantalla que abre la PWA instalada.
 */
export function EscanearFlow({ projects }: { projects: Project[] }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [run, setRun] = useState(0)
  // El formulario avisa "guardado" y "cerrar" en el mismo instante: el resumen se lee de una
  // referencia (un estado aún no se habría actualizado al llegar el cierre).
  const savedRef = useRef<SavedSummary | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  function toForm(file: File | null, scan: ScanResult | null) {
    savedRef.current = null
    setRun((n) => n + 1)
    setPhase({ kind: 'form', run: run + 1, file, scan })
  }

  async function readPhoto(file: File) {
    setPhase({ kind: 'reading', what: 'Leyendo la factura… puede tardar unos segundos.' })
    const form = new FormData()
    form.append('file', file)
    const res = await scanFiscalInvoice(form)
    if (!res.ok || !res.data) {
      setPhase({ kind: 'error', message: res.error ?? 'No se pudo leer la factura.', file })
      return
    }
    toForm(file, res.data)
  }

  async function readQr(text: string) {
    setPhase({ kind: 'reading', what: 'Leyendo el código y consultando la DGII…' })
    const res = await scanQrText(text)
    if (!res.ok || !res.data) {
      setPhase({ kind: 'error', message: res.error ?? 'No se pudo leer el código QR.', file: null })
      return
    }
    toForm(null, res.data)
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      <input
        ref={fileInput}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void readPhoto(file)
        }}
      />

      {phase.kind === 'idle' && (
        <div className="space-y-4">
          <div className="space-y-1 text-center">
            <h1 className="text-2xl font-bold tracking-tight">Escanear factura</h1>
            <p className="text-sm text-muted-foreground">
              Fotografía la factura o lee su código QR: se llena sola y tú solo confirmas y eliges el proyecto.
            </p>
          </div>

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-2xl bg-primary px-4 py-9 text-lg font-semibold text-primary-foreground shadow-sm transition active:scale-[0.99]"
          >
            <Camera className="size-10" />
            Fotografiar la factura
            <span className="text-xs font-normal opacity-80">Se lee con IA · también acepta un PDF</span>
          </button>

          <button
            type="button"
            onClick={() => setPhase({ kind: 'qr' })}
            className="flex w-full flex-col items-center gap-1 rounded-2xl border-2 border-primary px-4 py-6 text-base font-semibold text-primary transition active:scale-[0.99]"
          >
            <QrCode className="size-8" />
            Leer el código QR
            <span className="text-xs font-normal text-muted-foreground">Para e-CF: trae el estado de la DGII</span>
          </button>

          <Button variant="ghost" className="w-full" onClick={() => toForm(null, null)}>
            <PenLine className="size-4 mr-1.5" />
            Escribir los datos a mano
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            <Link href="/dashboard/facturas" className="underline underline-offset-4">Ver las facturas registradas</Link>
          </p>
        </div>
      )}

      {phase.kind === 'qr' && (
        <QrReader onResult={(text) => void readQr(text)} onCancel={() => setPhase({ kind: 'idle' })} />
      )}

      {phase.kind === 'reading' && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Loader2 className="size-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{phase.what}</p>
        </div>
      )}

      {phase.kind === 'error' && (
        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <p className="font-medium">No se pudo leer</p>
          <p className="text-sm">{phase.message}</p>
          <div className="flex flex-wrap gap-2">
            {phase.file && (
              <Button size="sm" onClick={() => void readPhoto(phase.file as File)}>
                Reintentar
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => toForm(phase.file, null)}>
              Escribirla a mano{phase.file ? ' (con esta foto)' : ''}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPhase({ kind: 'idle' })}>
              Volver
            </Button>
          </div>
        </div>
      )}

      {phase.kind === 'form' && (
        <div className="space-y-2">
          <h1 className="text-xl font-bold tracking-tight">Revisa y guarda</h1>
          <FacturaForm
            key={phase.run}
            projects={projects}
            prefill={phase.scan ?? undefined}
            prefillFile={phase.file ?? undefined}
            onSaved={(s) => {
              savedRef.current = s
            }}
            onDone={(saved) => {
              if (!saved) setPhase({ kind: 'idle' })
              // Sin resumen = la factura quedó guardada pero la foto falló y se cerró: no se sabe más.
              else setPhase({ kind: 'saved', summary: savedRef.current ?? { ncf: '', supplierName: '', total: 0, destino: '' } })
            }}
          />
        </div>
      )}

      {phase.kind === 'saved' && (
        <div className="space-y-4 py-6 text-center">
          <CheckCircle2 className="mx-auto size-14 text-emerald-600" />
          <div className="space-y-1">
            <h1 className="text-xl font-bold tracking-tight">Factura guardada</h1>
            {phase.summary.ncf && (
              <p className="text-sm text-muted-foreground">
                <span className="font-mono">{phase.summary.ncf}</span> · {phase.summary.supplierName}
                <br />
                {DOP.format(phase.summary.total)} · {phase.summary.destino}
              </p>
            )}
          </div>
          <Button className="w-full" size="lg" onClick={() => setPhase({ kind: 'idle' })}>
            Escanear otra
          </Button>
          <Button className="w-full" variant="outline" render={<Link href="/dashboard/facturas" />}>
            Ver las facturas
          </Button>
        </div>
      )}
    </div>
  )
}
