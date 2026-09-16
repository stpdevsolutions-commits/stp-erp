import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import type { Sprint } from '@/lib/types'
import { buildRange, sprintGeometry } from '@/lib/roadmap'
import { SPRINT_STATUS_LABELS, SPRINT_STATUS_BADGE, SPRINT_BAR } from './labels'

/** Gantt liviano: eje de meses arriba, una fila por etapa, la barra
 * posicionada por sus fechas reales y rellena según el % de tickets
 * resueltos. Sin librería de charts — la app no tiene ninguna y no hace
 * falta para esto. */
export function Timeline({ sprints }: { sprints: Sprint[] }) {
  const ordered = [...sprints].sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
  const range = buildRange(ordered)
  if (!range) return null

  const minWidth = Math.max(range.months.length * 104, 680)

  return (
    <div className="stp-scroll overflow-x-auto pb-1">
      <div style={{ minWidth }} className="relative [--rail:190px]">
        {/* Eje de meses */}
        <div
          className="relative mb-1 h-9 border-b border-border"
          style={{ marginLeft: 'var(--rail)' }}
        >
          {range.months.map((m, i) => (
            <div
              key={i}
              className="absolute top-0 flex h-full flex-col justify-end pb-1"
              style={{ left: `${m.leftPct}%`, width: `${m.widthPct}%` }}
            >
              {m.showYear && (
                <span className="font-mono text-[10px] leading-none text-muted-foreground/70">
                  {m.year}
                </span>
              )}
              <span className="text-xs leading-tight text-muted-foreground">{m.label}</span>
            </div>
          ))}
          {range.todayPct !== null && (
            <span
              className="absolute top-0 font-mono text-[10px] font-medium text-[var(--chart-4)]"
              style={{ left: `${range.todayPct}%`, transform: 'translateX(-50%)' }}
            >
              hoy
            </span>
          )}
        </div>

        {/* Filas */}
        <div>
          {ordered.map((s, i) => {
            const g = sprintGeometry(s, range)
            const bar = SPRINT_BAR[s.status]
            const wideEnough = g.widthPct > 16
            return (
              <div
                key={s.id}
                className="grid items-center border-b border-border/60 last:border-0"
                style={{ gridTemplateColumns: 'var(--rail) 1fr' }}
              >
                <Link
                  href={`#etapa-${s.id}`}
                  className="sticky left-0 z-10 flex flex-col gap-0.5 bg-background py-2.5 pr-3"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="truncate text-[13px] font-medium hover:underline">
                      {s.name}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Badge variant={SPRINT_STATUS_BADGE[s.status]} className="h-4 px-1.5 text-[10px]">
                      {SPRINT_STATUS_LABELS[s.status]}
                    </Badge>
                    <span className="truncate font-mono text-[10px] text-muted-foreground">
                      {s.project?.code ?? 'multi'}
                    </span>
                  </span>
                </Link>

                <div className="relative h-14">
                  {/* Líneas de mes */}
                  {range.months.map((m, mi) => (
                    <span
                      key={mi}
                      className="absolute inset-y-0 border-l border-border/50"
                      style={{ left: `${m.leftPct}%` }}
                    />
                  ))}
                  {/* Línea de hoy */}
                  {range.todayPct !== null && (
                    <span
                      className="absolute inset-y-1 z-20 w-px bg-[var(--chart-4)]"
                      style={{ left: `${range.todayPct}%` }}
                    />
                  )}
                  {/* Barra de la etapa */}
                  <div
                    className="absolute top-1/2 flex h-7 -translate-y-1/2 items-center overflow-hidden rounded-md"
                    style={{
                      left: `${g.leftPct}%`,
                      width: `${g.widthPct}%`,
                      background: bar.track,
                      border: bar.muted ? '1px dashed var(--border)' : '1px solid transparent',
                    }}
                  >
                    {!bar.muted && (
                      <div
                        className="h-full"
                        style={{ width: `${g.donePct}%`, background: bar.fill, opacity: 0.9 }}
                      />
                    )}
                    <span
                      className={`absolute px-2 font-mono text-[10px] ${
                        g.donePct > 55 && !bar.muted
                          ? 'left-0 text-primary-foreground'
                          : 'right-0 text-muted-foreground'
                      }`}
                    >
                      {wideEnough
                        ? `${s.stats.done}/${s.stats.total || '·'}`
                        : s.stats.total > 0
                          ? `${s.stats.done}/${s.stats.total}`
                          : ''}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
