'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/lib/toast'
import { mFetch, type WaContactView, type WaTemplateView } from '@/lib/messaging'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  contact: WaContactView
  onSent: () => void
}

/** Envío de una plantilla aprobada por Meta: única forma de escribir cuando se cerró la ventana de 24 h. */
export function PlantillaDialog({ open, onOpenChange, contact, onSent }: Props) {
  const [templates, setTemplates] = useState<WaTemplateView[]>([])
  const [name, setName] = useState('')
  const [values, setValues] = useState<string[]>([])
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open || templates.length) return
    mFetch<WaTemplateView[]>('/templates')
      .then((t) => {
        setTemplates(t)
        setName(t[0]?.name ?? '')
      })
      .catch((e: Error) => toast.error('No se cargaron las plantillas', e.message))
  }, [open, templates.length])

  const tpl = useMemo(() => templates.find((t) => t.name === name), [templates, name])

  // Al elegir plantilla, se precargan el nombre y el servicio que ya conocemos.
  useEffect(() => {
    if (!tpl) return
    const nombre = (contact.client?.name ?? contact.name ?? '').split(' ')[0]
    setValues(tpl.params.map((label, i) => (i === 0 ? nombre : /servicio/i.test(label) ? (contact.service ?? '') : '')))
  }, [tpl, contact.client, contact.name, contact.service])

  const ready = !!tpl && values.length === tpl.params.length && values.every((v) => v.trim())

  const rendered = useMemo(() => {
    if (!tpl) return ''
    let out = tpl.preview
    tpl.params.forEach((label, i) => {
      out = out.replace(`{${label}}`, values[i]?.trim() || `{${label}}`)
    })
    return out
  }, [tpl, values])

  const send = async () => {
    if (!tpl || !ready) return
    setSending(true)
    try {
      await mFetch(`/contacts/${contact.id}/templates`, {
        method: 'POST',
        body: JSON.stringify({ name: tpl.name, params: values.map((v) => v.trim()) }),
      })
      toast.success('Plantilla enviada')
      onOpenChange(false)
      onSent()
    } catch (e) {
      toast.error('No se pudo enviar', (e as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar plantilla</DialogTitle>
          <DialogDescription>
            Mensajes aprobados por WhatsApp. Se pueden enviar aunque hayan pasado más de 24 h; si el cliente responde,
            se vuelve a abrir la conversación libre.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Plantilla</Label>
            <select
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 w-full rounded-lg border bg-background px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 max-md:h-10 md:text-sm"
            >
              {templates.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {tpl?.params.map((label, i) => (
            <div key={label} className="space-y-1.5">
              <Label htmlFor={`tpl-p${i}`}>{label}</Label>
              <Input
                id={`tpl-p${i}`}
                value={values[i] ?? ''}
                maxLength={200}
                onChange={(e) => setValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
              />
            </div>
          ))}

          {tpl && (
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Así lo verá el cliente</p>
              <p className="whitespace-pre-wrap text-sm">{rendered}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={send} disabled={!ready || sending}>
            {sending ? 'Enviando…' : 'Enviar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
