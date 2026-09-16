import type { Sprint, Ticket } from '@/lib/types'

/** Las fechas de etapa (startDate/endDate) y resolvedAt vienen como
 * 'YYYY-MM-DD' (columnas DATE de Postgres). Se parsean al mediodía UTC para
 * que no se corran un día según la zona horaria del navegador. */
export function parseDay(d: string): Date {
  return new Date(`${d}T12:00:00Z`)
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

const MONTHS_ES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]
const MONTHS_ES_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export function shortDate(d: string | Date): string {
  const date = typeof d === 'string' ? parseDay(d) : d
  return `${date.getUTCDate()} ${MONTHS_ES[date.getUTCMonth()]}`
}

export function longDate(d: string | Date): string {
  const date = typeof d === 'string' ? parseDay(d) : d
  return `${date.getUTCDate()} de ${MONTHS_ES_LONG[date.getUTCMonth()]} de ${date.getUTCFullYear()}`
}

export interface TimelineMonth {
  label: string
  /** año, solo se muestra cuando cambia */
  year: number
  showYear: boolean
  leftPct: number
  widthPct: number
}

export interface TimelineRange {
  start: Date
  end: Date
  totalDays: number
  months: TimelineMonth[]
  todayPct: number | null
}

/** Ventana del timeline: desde el inicio de la etapa más temprana hasta el
 * fin de la más tardía, redondeado a mes completo para que el eje quede
 * limpio. */
export function buildRange(sprints: Sprint[]): TimelineRange | null {
  const active = sprints.filter((s) => s.status !== 'cancelled')
  const source = active.length > 0 ? active : sprints
  if (source.length === 0) return null

  let min = parseDay(source[0].startDate)
  let max = parseDay(source[0].endDate)
  for (const s of source) {
    const a = parseDay(s.startDate)
    const b = parseDay(s.endDate)
    if (a < min) min = a
    if (b > max) max = b
  }

  const start = new Date(Date.UTC(min.getUTCFullYear(), min.getUTCMonth(), 1, 12))
  const end = new Date(Date.UTC(max.getUTCFullYear(), max.getUTCMonth() + 1, 1, 12))
  const totalDays = daysBetween(start, end) || 1

  const months: TimelineMonth[] = []
  let cursor = new Date(start)
  let lastYear = -1
  while (cursor < end) {
    const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1, 12))
    const leftPct = (daysBetween(start, cursor) / totalDays) * 100
    const widthPct = (daysBetween(cursor, next > end ? end : next) / totalDays) * 100
    const year = cursor.getUTCFullYear()
    months.push({
      label: MONTHS_ES[cursor.getUTCMonth()],
      year,
      showYear: year !== lastYear,
      leftPct,
      widthPct,
    })
    lastYear = year
    cursor = next
  }

  const now = new Date()
  const todayPct =
    now >= start && now <= end ? (daysBetween(start, now) / totalDays) * 100 : null

  return { start, end, totalDays, months, todayPct }
}

export interface SprintGeometry {
  leftPct: number
  widthPct: number
  donePct: number
}

export function sprintGeometry(sprint: Sprint, range: TimelineRange): SprintGeometry {
  const a = parseDay(sprint.startDate)
  const b = parseDay(sprint.endDate)
  const leftPct = Math.max(0, (daysBetween(range.start, a) / range.totalDays) * 100)
  const rawWidth = (daysBetween(a, b) / range.totalDays) * 100
  const widthPct = Math.min(100 - leftPct, Math.max(rawWidth, 1.5))
  const donePct = sprint.stats.total > 0 ? (sprint.stats.done / sprint.stats.total) * 100 : 0
  return { leftPct, widthPct, donePct }
}

// ── Changelog ──────────────────────────────────────────────────────────────

export interface WeekGroup {
  key: string
  label: string
  tickets: Ticket[]
}

/** Lunes de la semana de una fecha, en UTC. */
function mondayOf(d: Date): Date {
  const day = d.getUTCDay() // 0 = domingo
  const diff = day === 0 ? -6 : 1 - day
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff, 12))
}

/** Tickets resueltos agrupados por semana, más recientes primero. */
export function groupResolvedByWeek(tickets: Ticket[]): WeekGroup[] {
  const done = tickets
    .filter((t) => t.status === 'done' && t.resolvedAt)
    .sort((a, b) => (a.resolvedAt! < b.resolvedAt! ? 1 : -1))

  const groups = new Map<string, WeekGroup>()
  for (const t of done) {
    const monday = mondayOf(parseDay(t.resolvedAt!))
    const key = monday.toISOString().slice(0, 10)
    if (!groups.has(key)) {
      groups.set(key, { key, label: `Semana del ${longDate(monday)}`, tickets: [] })
    }
    groups.get(key)!.tickets.push(t)
  }
  return [...groups.values()]
}

// ── Resumen general ────────────────────────────────────────────────────────

export interface RoadmapSummary {
  total: number
  done: number
  inFlight: number
  pending: number
  remaining: number
  donePct: number
  inFlightPct: number
  pendingPct: number
  activeSprints: number
  nextDeadline: string | null
}

/** Suma de los tickets de todas las etapas NO canceladas. "inFlight" =
 * en curso + en revisión. */
export function summarize(sprints: Sprint[]): RoadmapSummary {
  const live = sprints.filter((s) => s.status !== 'cancelled')
  let total = 0
  let done = 0
  let inFlight = 0
  let pending = 0
  for (const s of live) {
    total += s.stats.total
    done += s.stats.done
    inFlight += s.stats.inProgress + s.stats.review
    pending += s.stats.pending
  }
  const remaining = total - done
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0)

  const activeDeadlines = live
    .filter((s) => s.status === 'active')
    .map((s) => s.endDate)
    .sort()

  return {
    total,
    done,
    inFlight,
    pending,
    remaining,
    donePct: pct(done),
    inFlightPct: pct(inFlight),
    pendingPct: pct(pending),
    activeSprints: live.filter((s) => s.status === 'active').length,
    nextDeadline: activeDeadlines[0] ?? null,
  }
}
