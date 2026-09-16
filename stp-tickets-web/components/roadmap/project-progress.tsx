import type { Sprint, Ticket } from '@/lib/types'

interface Row {
  key: string
  name: string
  done: number
  total: number
}

/** "¿Cuánto nos falta?" por proyecto — sobre los tickets que están dentro de
 * alguna etapa viva. Lista con viñeta de progreso, no tarjetas iguales. */
export function ProjectProgress({
  sprints,
  tickets,
}: {
  sprints: Sprint[]
  tickets: Ticket[]
}) {
  const liveSprintIds = new Set(
    sprints.filter((s) => s.status !== 'cancelled').map((s) => s.id),
  )
  const inScope = tickets.filter((t) => t.sprintId && liveSprintIds.has(t.sprintId))

  const map = new Map<string, Row>()
  for (const t of inScope) {
    const key = t.projectId ?? '__none__'
    const name = t.project?.name ?? 'Sin proyecto'
    const row = map.get(key) ?? { key, name, done: 0, total: 0 }
    row.total += 1
    if (t.status === 'done') row.done += 1
    map.set(key, row)
  }

  const rows = [...map.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  if (rows.length === 0) return null

  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const pct = r.total > 0 ? (r.done / r.total) * 100 : 0
        return (
          <li key={r.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
            <span className="text-sm">{r.name}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {r.done}/{r.total}
            </span>
            <span className="col-span-2 h-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full bg-[var(--chart-2)]"
                style={{ width: `${pct}%` }}
              />
            </span>
          </li>
        )
      })}
    </ul>
  )
}
