'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { formatPhone, mFetch, STAGES, STAGE_LABELS, type LeadStage, type WaAgent, type WaContactView } from '@/lib/messaging'

const selectClass =
  'h-8 w-full rounded-lg border bg-background px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 max-md:h-10 md:text-sm'

interface Props {
  contact: WaContactView
  agents: WaAgent[]
  onChanged: () => void
}

/** Ficha del cliente potencial: etapa del pipeline, dueño, servicio, cliente del ERP y notas. */
export function PanelLead({ contact, agents, onChanged }: Props) {
  const [name, setName] = useState(contact.name ?? '')
  const [service, setService] = useState(contact.service ?? '')
  const [notes, setNotes] = useState(contact.notes ?? '')
  const [clientQuery, setClientQuery] = useState('')
  const [clientHits, setClientHits] = useState<{ id: string; name: string; phone: string | null }[]>([])

  useEffect(() => {
    const q = clientQuery.trim()
    if (q.length < 2) {
      setClientHits([])
      return
    }
    const t = setTimeout(() => {
      mFetch<{ id: string; name: string; phone: string | null }[]>(`/clients?search=${encodeURIComponent(q)}`)
        .then(setClientHits)
        .catch(() => setClientHits([]))
    }, 250)
    return () => clearTimeout(t)
  }, [clientQuery])

  const patch = async (body: Record<string, unknown>, okMsg?: string) => {
    try {
      await mFetch(`/contacts/${contact.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      if (okMsg) toast.success(okMsg)
      onChanged()
    } catch (e) {
      toast.error('No se pudo guardar', (e as Error).message)
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contacto</p>
        <a href={`tel:+${contact.phone}`} className="text-sm font-medium underline-offset-2 hover:underline">
          {formatPhone(contact.phone)}
        </a>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lead-name">Nombre</Label>
        <Input
          id="lead-name"
          value={name}
          placeholder="Sin nombre"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() !== (contact.name ?? '') && name.trim() && patch({ name: name.trim() })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lead-stage">Etapa</Label>
        <select
          id="lead-stage"
          className={selectClass}
          value={contact.stage}
          onChange={(e) => patch({ stage: e.target.value as LeadStage }, 'Etapa actualizada')}
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lead-owner">Responsable</Label>
        <select
          id="lead-owner"
          className={selectClass}
          value={contact.assignedTo?.id ?? ''}
          onChange={(e) => patch({ assignedToId: e.target.value || null }, 'Responsable actualizado')}
        >
          <option value="">Sin dueño (cola)</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lead-service">Servicio de interés</Label>
        <Input
          id="lead-service"
          value={service}
          placeholder="Presión constante, cámaras…"
          onChange={(e) => setService(e.target.value)}
          onBlur={() => service.trim() !== (contact.service ?? '') && patch({ service: service.trim() })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Cliente del ERP</Label>
        {contact.client ? (
          <div className="flex items-center justify-between gap-2 text-sm">
            <Link href={`/dashboard/clientes/${contact.client.id}`} className="truncate font-medium underline-offset-2 hover:underline">
              {contact.client.name}
            </Link>
            <Button variant="ghost" size="xs" onClick={() => patch({ clientId: null }, 'Enlace quitado')}>
              Quitar
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Input
              value={clientQuery}
              onChange={(e) => setClientQuery(e.target.value)}
              placeholder="Buscar cliente por nombre…"
              aria-label="Buscar cliente para enlazar"
            />
            {clientHits.length > 0 && (
              <ul className="overflow-hidden rounded-lg border">
                {clientHits.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-muted max-md:py-3"
                      onClick={() => {
                        setClientQuery('')
                        setClientHits([])
                        void patch({ clientId: c.id }, 'Cliente enlazado')
                      }}
                    >
                      <span className="font-medium">{c.name}</span>
                      {c.phone && <span className="text-xs text-muted-foreground">{c.phone}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">Sin enlazar. Si el número está en la ficha de un cliente, se enlaza solo.</p>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lead-notes">Notas internas</Label>
        <textarea
          id="lead-notes"
          rows={6}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (contact.notes ?? '') && patch({ notes })}
          placeholder="Lo que conviene recordar de este cliente potencial"
          className="w-full resize-y rounded-lg border bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
        />
        <p className="text-xs text-muted-foreground">Se guardan al salir del campo. El cliente no las ve.</p>
      </div>
    </div>
  )
}
