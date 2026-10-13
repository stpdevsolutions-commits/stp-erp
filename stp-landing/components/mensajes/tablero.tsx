'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { contactTitle, formatListTime, STAGES, STAGE_LABELS, type WaContactView } from '@/lib/messaging'

interface Props {
  contacts: WaContactView[]
  onOpen: (id: string) => void
}

/** Pipeline de ventas: una columna por etapa con las conversaciones que están en ella. */
export function Tablero({ contacts, onOpen }: Props) {
  return (
    <div className="flex h-full gap-3 overflow-x-auto p-3">
      {STAGES.map((stage) => {
        const items = contacts.filter((c) => c.stage === stage)
        return (
          <section key={stage} className="flex w-64 shrink-0 flex-col rounded-lg bg-muted/40" aria-label={STAGE_LABELS[stage]}>
            <h3 className="flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {STAGE_LABELS[stage]}
              <span className="tabular-nums">{items.length}</span>
            </h3>
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
              {items.length === 0 && <li className="px-1 py-3 text-xs text-muted-foreground">Vacía</li>}
              {items.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => onOpen(c.id)}
                    className={cn(
                      'w-full space-y-1 rounded-lg border bg-card p-3 text-left text-sm shadow-sm transition-colors hover:border-primary/50',
                      c.awaitingReply && 'border-l-4 border-l-primary',
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium">{contactTitle(c)}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatListTime(c.lastMessageAt)}</span>
                    </span>
                    {c.service && <span className="block truncate text-xs text-muted-foreground">{c.service}</span>}
                    <span className="block line-clamp-2 text-xs text-muted-foreground">{c.lastMessagePreview}</span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {c.awaitingReply && <Badge variant="outline" className="text-[0.65rem]">Esperando respuesta</Badge>}
                      <span className="text-[0.7rem] text-muted-foreground">{c.assignedTo ? c.assignedTo.name : 'Sin dueño'}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
