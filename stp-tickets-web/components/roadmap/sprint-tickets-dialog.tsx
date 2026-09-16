'use client'

import { useMemo, useState, useTransition } from 'react'
import { Check, Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { Sprint, Ticket } from '@/lib/types'
import { setTicketSprint } from '@/lib/actions/sprints'
import { STATUS_LABELS, STATUS_BADGE } from '@/components/tickets/labels'

function code(t: Ticket): string {
  return t.project?.code ? `${t.project.code}-${t.projectNumber}` : `#${t.number}`
}

export function SprintTicketsDialog({
  sprint,
  allTickets,
  open,
  onOpenChange,
}: {
  sprint: Sprint
  allTickets: Ticket[]
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [q, setQ] = useState('')
  const [pending, startTransition] = useTransition()
  // Cambios optimistas: sprintId local por ticket mientras el server responde.
  const [localSprint, setLocalSprint] = useState<Record<string, string | null>>({})

  const currentSprintId = (t: Ticket) =>
    t.id in localSprint ? localSprint[t.id] : t.sprintId

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return allTickets
      .filter((t) => {
        const sid = currentSprintId(t)
        // Se muestran los de esta etapa y los que están libres. Los de otra
        // etapa se ocultan para no robarlos sin querer.
        if (sid && sid !== sprint.id) return false
        if (!needle) return true
        return (
          t.title.toLowerCase().includes(needle) ||
          code(t).toLowerCase().includes(needle) ||
          (t.project?.name ?? '').toLowerCase().includes(needle)
        )
      })
      .sort((a, b) => {
        const ain = currentSprintId(a) === sprint.id ? 0 : 1
        const bin = currentSprintId(b) === sprint.id ? 0 : 1
        return ain - bin || b.number - a.number
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTickets, q, localSprint, sprint.id])

  function toggle(t: Ticket) {
    const isIn = currentSprintId(t) === sprint.id
    const next = isIn ? null : sprint.id
    setLocalSprint((prev) => ({ ...prev, [t.id]: next }))
    startTransition(async () => {
      const res = await setTicketSprint(t.id, next)
      if (!res.ok) {
        // Revertir si falló.
        setLocalSprint((prev) => ({ ...prev, [t.id]: isIn ? sprint.id : null }))
      }
    })
  }

  const inCount = allTickets.filter((t) => currentSprintId(t) === sprint.id).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tickets de {sprint.name}</DialogTitle>
          <DialogDescription>
            {inCount} en esta etapa. Marca o desmarca para moverlos; los que ya están en otra
            etapa no aparecen.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar ticket..."
            className="pl-8"
          />
        </div>

        <div
          className={`stp-scroll -mx-1 max-h-[52vh] space-y-0.5 overflow-y-auto px-1 ${
            pending ? 'opacity-70' : ''
          }`}
        >
          {rows.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Nada que mostrar.</p>
          )}
          {rows.map((t) => {
            const isIn = currentSprintId(t) === sprint.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggle(t)}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted"
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                    isIn
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input'
                  }`}
                >
                  {isIn && <Check className="size-3" />}
                </span>
                <span className="font-mono text-xs text-muted-foreground">{code(t)}</span>
                <span className="flex-1 truncate text-sm">{t.title}</span>
                <Badge variant={STATUS_BADGE[t.status]} className="h-4 shrink-0 px-1.5 text-[10px]">
                  {STATUS_LABELS[t.status]}
                </Badge>
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
