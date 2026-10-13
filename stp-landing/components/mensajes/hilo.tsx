'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowLeft, Check, CheckCheck, FileText, Info, Paperclip, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import {
  contactTitle,
  formatDayLabel,
  formatHour,
  formatPhone,
  mFetch,
  sameDay,
  windowLeft,
  type WaAgent,
  type WaContactView,
  type WaMessageView,
} from '@/lib/messaging'
import { PanelLead } from './panel-lead'
import { PlantillaDialog } from './plantilla-dialog'

const POLL_MS = 3000

interface Props {
  contact: WaContactView
  agents: WaAgent[]
  onChanged: () => void
  onBack: () => void
}

function Estado({ m }: { m: WaMessageView }) {
  if (m.direction !== 'out') return null
  if (m.status === 'failed') {
    return <AlertCircle className="size-3.5 text-destructive" aria-label={`No se entregó: ${m.error ?? ''}`} />
  }
  if (m.status === 'read') return <CheckCheck className="size-3.5 text-sky-500" aria-label="Leído" />
  if (m.status === 'delivered') return <CheckCheck className="size-3.5" aria-label="Entregado" />
  return <Check className="size-3.5" aria-label="Enviado" />
}

function Adjunto({ m }: { m: WaMessageView }) {
  if (!m.hasMedia) {
    return m.type === 'text' || m.type === 'location' || m.type === 'template' || m.type === 'interactive' || m.type === 'button' ? null : (
      <p className="text-xs italic opacity-70">Adjunto no disponible</p>
    )
  }
  const src = `/api/messaging/messages/${m.id}/media`
  if (m.type === 'image' || m.type === 'sticker') {
    return (
      <a href={src} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Foto recibida" className="max-h-64 rounded-md object-cover" loading="lazy" />
      </a>
    )
  }
  if (m.type === 'audio') return <audio controls src={src} className="max-w-full" preload="none" />
  if (m.type === 'video') return <video controls src={src} className="max-h-64 rounded-md" preload="none" />
  return (
    <a href={src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm underline underline-offset-2">
      <FileText className="size-4" />
      {m.filename ?? 'Documento'}
    </a>
  )
}

/** Texto con los enlaces https clicables (la ubicación llega como enlace de mapa). */
function Texto({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g)
  return (
    <p className="whitespace-pre-wrap break-words text-sm">
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            {p.includes('google.com/maps') ? 'Ver ubicación en el mapa' : p}
          </a>
        ) : (
          p
        ),
      )}
    </p>
  )
}

export function Hilo({ contact, agents, onChanged, onBack }: Props) {
  const [messages, setMessages] = useState<WaMessageView[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [ficha, setFicha] = useState(false)
  const [plantilla, setPlantilla] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const markedFor = useRef<number>(-1)

  const loadThread = useCallback(async () => {
    try {
      const rows = await mFetch<WaMessageView[]>(`/contacts/${contact.id}/messages?limit=200`)
      setMessages(rows)
    } catch {
      /* el siguiente ciclo reintenta */
    }
  }, [contact.id])

  useEffect(() => {
    void loadThread()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void loadThread()
    }, POLL_MS)
    return () => clearInterval(id)
  }, [loadThread])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // Marca como leída al abrir y cada vez que llega algo mientras está abierta.
  useEffect(() => {
    if (contact.unreadCount > 0 && markedFor.current !== contact.unreadCount) {
      markedFor.current = contact.unreadCount
      mFetch(`/contacts/${contact.id}/read`, { method: 'POST' }).then(onChanged).catch(() => {})
    }
  }, [contact.id, contact.unreadCount, onChanged])

  useEffect(() => {
    if (stick.current) bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  const onScroll = () => {
    const el = scroller.current
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const left = contact.windowEndsAt ? windowLeft(contact.windowEndsAt, now) : null
  const windowOpen = left !== null

  const send = async () => {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    try {
      await mFetch(`/contacts/${contact.id}/messages`, { method: 'POST', body: JSON.stringify({ text: body }) })
      setText('')
      stick.current = true
      await loadThread()
      onChanged()
    } catch (e) {
      toast.error('No se pudo enviar', (e as Error).message)
    } finally {
      setSending(false)
    }
  }

  const attach = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      toast.error('El archivo pesa más de 10 MB')
      return
    }
    setSending(true)
    const id = toast.loading(`Enviando ${file.name}…`)
    try {
      const form = new FormData()
      form.append('file', file)
      if (text.trim()) form.append('caption', text.trim())
      const res = await fetch(`/api/messaging/contacts/${contact.id}/attachments`, { method: 'POST', body: form })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string | string[] }
        throw new Error(Array.isArray(err.message) ? err.message.join(', ') : (err.message ?? 'Error al enviar'))
      }
      toast.done(id, 'Archivo enviado')
      setText('')
      stick.current = true
      await loadThread()
      onChanged()
    } catch (e) {
      toast.fail(id, (e as Error).message)
    } finally {
      setSending(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const take = async () => {
    try {
      await mFetch(`/contacts/${contact.id}/take`, { method: 'POST' })
      toast.success('Conversación tomada')
      onChanged()
    } catch (e) {
      toast.error('No se pudo tomar', (e as Error).message)
    }
  }

  return (
    <div className="flex h-full min-w-0">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Encabezado */}
        <header className="flex items-center gap-2 border-b px-3 py-2.5">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack} aria-label="Volver a la lista">
            <ArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">{contactTitle(contact)}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {[contactTitle(contact) !== formatPhone(contact.phone) ? formatPhone(contact.phone) : null, contact.service]
                .filter(Boolean)
                .join(' · ') || 'Sin datos todavía'}
            </p>
          </div>
          {!contact.assignedTo && (
            <Button size="sm" onClick={take}>
              Tomar
            </Button>
          )}
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setFicha(true)} aria-label="Ver ficha">
            <Info />
          </Button>
        </header>

        {/* Mensajes */}
        <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-muted/30 px-3 py-4">
          {messages.length === 0 && <p className="text-center text-sm text-muted-foreground">Sin mensajes todavía.</p>}
          {messages.map((m, i) => {
            const out = m.direction === 'out'
            const newDay = i === 0 || !sameDay(messages[i - 1].sentAt, m.sentAt)
            return (
              <div key={m.id}>
                {newDay && (
                  <p className="my-3 text-center text-xs font-medium text-muted-foreground">{formatDayLabel(m.sentAt)}</p>
                )}
                <div className={cn('flex', out ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[85%] space-y-1 rounded-2xl px-3 py-2 shadow-sm sm:max-w-[70%]',
                      out ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border bg-card',
                      m.status === 'failed' && 'ring-2 ring-destructive/60',
                    )}
                  >
                    <Adjunto m={m} />
                    {m.body && <Texto text={m.body} />}
                    {m.templateName && <p className="text-[0.65rem] uppercase tracking-wide opacity-70">Plantilla</p>}
                    <div className={cn('flex items-center justify-end gap-1 text-[0.7rem]', out ? 'opacity-80' : 'text-muted-foreground')}>
                      <span>{formatHour(m.sentAt)}</span>
                      <Estado m={m} />
                    </div>
                    {m.status === 'failed' && m.error && <p className="text-xs">No se entregó: {m.error}</p>}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={bottom} />
        </div>

        {/* Redactar */}
        <footer className="border-t p-3">
          {windowOpen ? (
            <>
              <div className="flex items-end gap-2">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 768px)').matches) {
                      e.preventDefault()
                      void send()
                    }
                  }}
                  rows={2}
                  maxLength={4000}
                  placeholder="Escribe una respuesta…"
                  aria-label="Mensaje"
                  className="min-h-[3.25rem] flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                />
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={(e) => void attach(e.target.files?.[0])}
                />
                <Button
                  variant="outline"
                  size="lg"
                  disabled={sending}
                  onClick={() => fileInput.current?.click()}
                  aria-label="Adjuntar foto o PDF"
                >
                  <Paperclip />
                </Button>
                <Button onClick={send} disabled={!text.trim() || sending} size="lg" aria-label="Enviar">
                  <Send />
                </Button>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Puedes escribir libremente por {left} más. Después solo se pueden enviar plantillas.
              </p>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Pasaron más de 24 h desde el último mensaje del cliente: WhatsApp solo permite una plantilla aprobada.
              </p>
              <Button onClick={() => setPlantilla(true)}>Enviar plantilla</Button>
            </div>
          )}
          {windowOpen && (
            <button
              type="button"
              onClick={() => setPlantilla(true)}
              className="mt-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Enviar una plantilla en su lugar
            </button>
          )}
        </footer>
      </div>

      {/* Ficha del lead (escritorio) */}
      <aside className="hidden w-72 shrink-0 overflow-y-auto border-l lg:block">
        <PanelLead contact={contact} agents={agents} onChanged={onChanged} />
      </aside>

      {/* Ficha del lead (móvil) */}
      <Dialog open={ficha} onOpenChange={setFicha}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ficha</DialogTitle>
          </DialogHeader>
          <PanelLead contact={contact} agents={agents} onChanged={onChanged} />
        </DialogContent>
      </Dialog>

      <PlantillaDialog
        open={plantilla}
        onOpenChange={setPlantilla}
        contact={contact}
        onSent={() => {
          stick.current = true
          void loadThread()
          onChanged()
        }}
      />
    </div>
  )
}
