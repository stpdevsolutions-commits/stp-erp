import Link from 'next/link'
import type { Ticket } from '@/lib/types'
import { groupResolvedByWeek } from '@/lib/roadmap'

function code(t: Ticket): string {
  return t.project?.code ? `${t.project.code}-${t.projectNumber}` : `#${t.number}`
}

/** Feed de lo entregado, agrupado por semana. Responde a "qué hemos hecho":
 * todo ticket resuelto, tenga etapa o no. */
export function Changelog({ tickets, limitWeeks }: { tickets: Ticket[]; limitWeeks?: number }) {
  const weeks = groupResolvedByWeek(tickets)
  const shown = limitWeeks ? weeks.slice(0, limitWeeks) : weeks

  if (shown.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay nada marcado como resuelto.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {shown.map((w) => (
        <div key={w.key}>
          <div className="mb-2 flex items-baseline gap-2">
            <h3 className="text-sm font-medium">{w.label}</h3>
            <span className="font-mono text-xs text-muted-foreground">
              {w.tickets.length} {w.tickets.length === 1 ? 'entrega' : 'entregas'}
            </span>
          </div>
          <ul className="border-l border-border">
            {w.tickets.map((t) => (
              <li key={t.id} className="relative pl-4">
                <span className="absolute -left-[3px] top-[0.6rem] size-[5px] rounded-full bg-[var(--chart-2)]" />
                <Link
                  href={`/tickets/${t.id}`}
                  className="group flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5"
                >
                  <span className="font-mono text-xs text-muted-foreground">{code(t)}</span>
                  <span className="text-sm group-hover:underline">{t.title}</span>
                  <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">
                    {t.project?.name ?? 'Sin proyecto'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
