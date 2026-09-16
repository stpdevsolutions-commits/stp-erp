import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import type { Project, Sprint, Ticket } from '@/lib/types'
import { shortDate, parseDay } from '@/lib/roadmap'
import { STATUS_LABELS, STATUS_BADGE, PRIORITY_WEIGHT } from '@/components/tickets/labels'
import { SPRINT_STATUS_LABELS, SPRINT_STATUS_BADGE } from './labels'
import { SprintActions } from './sprint-actions'
import { Meter } from './meter'

function code(t: Ticket): string {
  return t.project?.code ? `${t.project.code}-${t.projectNumber}` : `#${t.number}`
}

function dateSpan(s: Sprint): string {
  const a = parseDay(s.startDate)
  const b = parseDay(s.endDate)
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear()
  const left = shortDate(a)
  const right = `${shortDate(b)} ${b.getUTCFullYear()}`
  return sameYear ? `${left} – ${right}` : `${left} ${a.getUTCFullYear()} – ${right}`
}

/** Barra segmentada de avance: resuelto / en curso / pendiente. Los tres
 * segmentos con tratamiento distinto, no solo color. */
function ProgressMeter({ sprint }: { sprint: Sprint }) {
  const { total, done, inProgress, review, pending } = sprint.stats
  if (total === 0) {
    return <p className="text-xs text-muted-foreground">Sin tickets asignados todavía.</p>
  }
  const inFlight = inProgress + review
  return (
    <div className="space-y-1.5">
      <Meter done={done} inFlight={inFlight} pending={pending} total={total} />
      <p className="font-mono text-xs text-muted-foreground">
        {done} de {total} resueltos
        {inFlight > 0 && `, ${inFlight} en curso`}
        {pending > 0 && `, ${pending} sin empezar`}
      </p>
    </div>
  )
}

export function SprintSection({
  sprint,
  index,
  tickets,
  projects,
  allTickets,
}: {
  sprint: Sprint
  index: number
  tickets: Ticket[]
  projects: Project[]
  allTickets: Ticket[]
}) {
  const sorted = [...tickets].sort((a, b) => {
    const order = { pending: 0, in_progress: 1, review: 2, done: 3, cancelled: 4 }
    return (
      order[a.status] - order[b.status] ||
      PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] ||
      b.number - a.number
    )
  })

  return (
    <section id={`etapa-${sprint.id}`} className="scroll-mt-20 border-t border-border pt-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {String(index + 1).padStart(2, '0')}
            </span>
            <h2 className="text-base font-semibold">{sprint.name}</h2>
            <Badge variant={SPRINT_STATUS_BADGE[sprint.status]} className="h-4 px-1.5 text-[10px]">
              {SPRINT_STATUS_LABELS[sprint.status]}
            </Badge>
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            <span>{dateSpan(sprint)}</span>
            <span className="ml-3 text-muted-foreground/80">
              {sprint.project ? sprint.project.name : 'varios proyectos'}
            </span>
          </p>
        </div>
        <SprintActions sprint={sprint} projects={projects} allTickets={allTickets} />
      </div>

      {sprint.goal && (
        <p className="mt-3 max-w-prose text-sm text-foreground/90">{sprint.goal}</p>
      )}

      <div className="mt-4 max-w-md">
        <ProgressMeter sprint={sprint} />
      </div>

      {sorted.length > 0 && (
        <ul className="stp-scroll mt-4 max-h-80 space-y-px overflow-y-auto">
          {sorted.map((t) => (
            <li key={t.id}>
              <Link
                href={`/tickets/${t.id}`}
                className="group flex items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-muted"
              >
                <Badge
                  variant={STATUS_BADGE[t.status]}
                  className="h-4 w-20 shrink-0 justify-center px-1 text-[10px]"
                >
                  {STATUS_LABELS[t.status]}
                </Badge>
                <span className="font-mono text-xs text-muted-foreground">{code(t)}</span>
                <span className="flex-1 truncate text-sm group-hover:underline">{t.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
