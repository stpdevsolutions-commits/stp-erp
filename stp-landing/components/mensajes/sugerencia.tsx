'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { mFetch, type WaContactView } from '@/lib/messaging'

interface SugerenciaView {
  id: string
  status: string
  kind: 'responder' | 'derivar' | 'ninguna'
  category: string | null
  summary: string | null
  service: string | null
  serviceLabel: string | null
  lead: { name: string | null; location: string | null; details: string | null }
  missing: string[]
  escalate: boolean
  escalationReasons: string[]
  reply: string | null
  confidence: number
  error: string | null
  dataApplied: boolean
}

interface Respuesta {
  enabled: boolean
  suggestion: SugerenciaView | null
}

const CATEGORIAS: Record<string, string> = {
  nueva_consulta: 'Consulta nueva',
  solicitud_visita: 'Pide visita técnica',
  cotizacion: 'Cotización',
  seguimiento: 'Seguimiento',
  informacion_general: 'Información general',
  queja: 'Queja',
  urgencia: 'Urgencia',
  cliente_existente: 'Cliente existente',
  precio: 'Pregunta por precio',
  fuera_de_alcance: 'Fuera de los servicios',
  hablar_con_persona: 'Quiere hablar con una persona',
  mensaje_no_texto: 'Mensaje sin texto',
  spam: 'Posible spam',
}

const POLL_MS = 10_000

interface Props {
  contact: WaContactView
  /** Se llama tras enviar para que el hilo recargue. */
  onSent: () => void
}

/**
 * Tarjeta del copiloto (ERP-56 fase 2): lo que la IA entendió del último mensaje y la respuesta que propone.
 * Nada sale solo: la persona la revisa, la edita si quiere y pulsa Enviar. Se oculta si el copiloto está apagado.
 */
export function Sugerencia({ contact, onSent }: Props) {
  const [data, setData] = useState<Respuesta | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const shownId = useRef<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await mFetch<Respuesta>(`/contacts/${contact.id}/suggestion`)
      setData(r)
      const id = r.suggestion?.id ?? null
      if (id !== shownId.current) {
        shownId.current = id
        setDraft(r.suggestion?.reply ?? '')
      }
    } catch {
      /* el siguiente ciclo lo reintenta */
    }
  }, [contact.id])

  useEffect(() => {
    shownId.current = null
    setData(null)
    void load()
  }, [load, contact.lastMessageAt])

  useEffect(() => {
    if (data && !data.enabled) return
    const t = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(t)
  }, [data, load])

  if (!data?.enabled || !data.suggestion) return null
  const s = data.suggestion

  const run = async (fn: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      toast.error((err as Error).message)
      void load()
    } finally {
      setBusy(false)
    }
  }

  const enviar = () =>
    run(async () => {
      await mFetch(`/suggestions/${s.id}/send`, { method: 'POST', body: JSON.stringify({ text: draft.trim() }) })
      toast.success('Respuesta enviada')
      setData({ ...data, suggestion: null })
      onSent()
    })
  const descartar = () =>
    run(async () => {
      await mFetch(`/suggestions/${s.id}/discard`, { method: 'POST' })
      setData({ ...data, suggestion: null })
    })
  const aplicar = () =>
    run(async () => {
      await mFetch(`/suggestions/${s.id}/apply`, { method: 'POST' })
      toast.success('Datos aplicados al lead')
      setData({ ...data, suggestion: { ...s, dataApplied: true } })
      onSent()
    })

  if (s.status === 'failed') {
    return (
      <div className="flex items-center justify-between gap-2 border-t bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <span>{s.error ?? 'No hubo sugerencia del asistente.'}</span>
        <Button variant="ghost" size="sm" onClick={descartar} disabled={busy}>
          Ocultar
        </Button>
      </div>
    )
  }

  const tieneDatos = !!(s.service && s.service !== 'otro') || !!s.lead.name || !!s.summary

  return (
    <section aria-label="Sugerencia del asistente" className="space-y-2 border-t bg-primary/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-4 text-primary" aria-hidden />
        <h3 className="text-sm font-medium">Sugerencia del asistente</h3>
        {s.category && (
          <span className="rounded-full border bg-background px-2 py-0.5 text-xs">{CATEGORIAS[s.category] ?? s.category}</span>
        )}
        {s.serviceLabel && s.service !== 'otro' && (
          <span className="rounded-full border bg-background px-2 py-0.5 text-xs">{s.serviceLabel}</span>
        )}
      </div>

      {s.escalate && (
        <div className="flex gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-2 text-sm" role="note">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
          <div>
            <p className="font-medium">Lo debe atender una persona</p>
            <ul className="list-inside list-disc text-xs text-muted-foreground">
              {s.escalationReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {s.summary && <p className="text-sm">{s.summary}</p>}
      {(s.lead.location || s.lead.details || s.missing.length > 0) && (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {s.lead.location && <li>Ubicación: {s.lead.location}</li>}
          {s.lead.details && <li>Detalles: {s.lead.details}</li>}
          {s.missing.length > 0 && <li>Falta preguntar: {s.missing.join('; ')}</li>}
        </ul>
      )}

      {s.reply !== null && (
        <>
          <label className="block text-xs font-medium text-muted-foreground" htmlFor={`sug-${s.id}`}>
            Respuesta propuesta (puedes editarla antes de enviar)
          </label>
          <textarea
            id={`sug-${s.id}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            maxLength={4000}
            className="w-full resize-y rounded-lg border bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
          />
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {s.reply !== null && (
          <Button size="sm" onClick={enviar} disabled={busy || !draft.trim()}>
            Enviar esta respuesta
          </Button>
        )}
        {tieneDatos && !s.dataApplied && (
          <Button size="sm" variant="outline" onClick={aplicar} disabled={busy}>
            Aplicar datos al lead
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={descartar} disabled={busy}>
          {s.reply !== null ? 'Descartar' : 'Entendido'}
        </Button>
        <span className="ml-auto text-[0.7rem] text-muted-foreground">Generado por IA, revísalo antes de enviar.</span>
      </div>
    </section>
  )
}
