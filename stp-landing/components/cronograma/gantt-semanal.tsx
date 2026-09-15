'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartEmpty, ChartLegend, ChartTable } from '@/components/charts/chart-frame'
import type { Project, Task } from '@/lib/types'

const STATUS_LABELS: Record<Task['status'], string> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  review: 'En revisión',
  done: 'Completada',
  cancelled: 'Cancelada',
}

// Mismo lenguaje de color que el resto del ERP (slots categóricos fijos de VizTokens).
const STATUS_COLOR: Record<Task['status'], string> = {
  pending: 'var(--viz-s3)',
  in_progress: 'var(--viz-s2)',
  review: 'var(--viz-s4)',
  done: 'var(--viz-s1)',
  cancelled: 'var(--viz-s5)',
}

const STATUS_ORDER: Task['status'][] = ['pending', 'in_progress', 'review', 'done', 'cancelled']

function atMidnight(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`)
}

function mondayOf(d: Date): Date {
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1) - day
  const m = new Date(d)
  m.setDate(d.getDate() + diff)
  m.setHours(0, 0, 0, 0)
  return m
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

const fmtShort = (d: Date) => d.toLocaleDateString('es-DO', { day: 'numeric', month: 'short' })
const fmtFull = (d: Date) => d.toLocaleDateString('es-DO')

function nombreAsignado(t: Task): string {
  if (t.collaborator) return `${t.collaborator.firstName} ${t.collaborator.lastName}`
  if (t.assignedTo) return `${t.assignedTo.firstName} ${t.assignedTo.lastName}`
  return 'Sin asignar'
}

const MAX_WEEKS = 60

/**
 * Cronograma semanal — cada actividad es una barra que ocupa las semanas
 * entre su inicio y su fecha límite.
 *
 * Una actividad sin `startDate` (todavía la mayoría, es un campo nuevo) se
 * dibuja como una barra de una sola semana en su fecha límite en vez de
 * desaparecer del todo — así la vista es útil de inmediato, no solo para
 * actividades creadas después de este cambio. Una actividad sin ninguna
 * fecha no se puede ubicar en el tiempo: se lista aparte, nunca se inventa
 * una posición para ella.
 */
export function GanttSemanal({ project, tasks }: { project: Project; tasks: Task[] }) {
  const [hoverId, setHoverId] = useState<string | null>(null)

  const { weeks, ubicables, sinFecha, truncated } = useMemo(() => {
    const conFecha = tasks.filter((t) => t.startDate || t.dueDate)
    const sinFecha = tasks.filter((t) => !t.startDate && !t.dueDate)

    const candidatas: Date[] = []
    if (project.startDate) candidatas.push(atMidnight(project.startDate))
    if (project.endDate) candidatas.push(atMidnight(project.endDate))
    for (const t of conFecha) {
      if (t.startDate) candidatas.push(atMidnight(t.startDate))
      if (t.dueDate) candidatas.push(atMidnight(t.dueDate))
    }

    if (candidatas.length === 0) {
      return { weeks: [], ubicables: [], sinFecha, gridStart: null as Date | null, truncated: false }
    }

    const minDate = new Date(Math.min(...candidatas.map((d) => d.getTime())))
    const maxDate = new Date(Math.max(...candidatas.map((d) => d.getTime())))
    const gridStart = mondayOf(minDate)

    const weeks: { start: Date; end: Date }[] = []
    let cursor = gridStart
    // Antes, al llegar a MAX_WEEKS el `while` simplemente paraba y las actividades más
    // allá del rango se apretujaban en silencio contra la última semana dibujada
    // (ver `weekIndexOf`) — parecían estar donde no estaban, sin ningún aviso.
    let truncated = false
    while (cursor <= maxDate) {
      if (weeks.length >= MAX_WEEKS) {
        truncated = true
        break
      }
      const end = addDays(cursor, 6)
      weeks.push({ start: cursor, end })
      cursor = addDays(cursor, 7)
    }
    if (weeks.length === 0) weeks.push({ start: gridStart, end: addDays(gridStart, 6) })

    const weekIndexOf = (d: Date) => {
      const idx = Math.floor(diffDays(gridStart, d) / 7)
      return Math.min(Math.max(idx, 0), weeks.length - 1)
    }

    const ubicables = conFecha
      .map((t) => {
        const start = t.startDate ? atMidnight(t.startDate) : atMidnight(t.dueDate!)
        const end = t.dueDate ? atMidnight(t.dueDate) : atMidnight(t.startDate!)
        const [efStart, efEnd] = start <= end ? [start, end] : [end, start]
        return {
          task: t,
          start: efStart,
          end: efEnd,
          colStart: weekIndexOf(efStart),
          colEnd: weekIndexOf(efEnd),
        }
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime())

    return { weeks, ubicables, sinFecha, gridStart, truncated }
  }, [project.startDate, project.endDate, tasks])

  if (weeks.length === 0) {
    return (
      <Card className="stp-viz">
        <CardHeader className="gap-1">
          <CardTitle className="text-base">Cronograma semanal</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartEmpty
            message="Aún no hay fechas para ubicar en el calendario"
            hint="Agrega una fecha de inicio o fecha límite a las actividades del proyecto, o fechas de inicio/fin al proyecto."
          />
        </CardContent>
      </Card>
    )
  }

  const legend = STATUS_ORDER.map((s) => ({ label: STATUS_LABELS[s], color: STATUS_COLOR[s] }))

  return (
    <Card className="stp-viz">
      <CardHeader className="gap-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Cronograma semanal</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {ubicables.length} actividad{ubicables.length === 1 ? '' : 'es'} ubicada
              {ubicables.length === 1 ? '' : 's'} · {weeks.length} semana{weeks.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        {truncated && (
          <p className="rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
            El rango de fechas del proyecto supera las {MAX_WEEKS} semanas que se pueden
            dibujar: solo se muestran las primeras {MAX_WEEKS}. Las actividades más allá de
            ese punto no aparecen en la barra correcta.
          </p>
        )}
        <ChartLegend items={legend} />
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div style={{ minWidth: `${160 + weeks.length * 72}px` }}>
            {/* Encabezado de semanas */}
            <div className="flex border-b border-border/60 pb-1.5 text-[10px] text-muted-foreground">
              <div className="w-40 shrink-0" />
              <div
                className="grid flex-1 gap-[2px]"
                style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(70px, 1fr))` }}
              >
                {weeks.map((w, i) => (
                  <div key={i} className="text-center">
                    {fmtShort(w.start)}
                  </div>
                ))}
              </div>
            </div>

            {/* Filas de actividades */}
            <div className="mt-1.5 space-y-1.5">
              {ubicables.map(({ task: t, start, end, colStart, colEnd }) => (
                <div
                  key={t.id}
                  className="flex items-center"
                  onMouseEnter={() => setHoverId(t.id)}
                  onMouseLeave={() => setHoverId(null)}
                >
                  <div className="w-40 shrink-0 truncate pr-2 text-xs" title={t.title}>
                    {t.title}
                  </div>
                  <div
                    className="grid flex-1 items-center gap-[2px]"
                    style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(70px, 1fr))` }}
                  >
                    <div
                      className="viz-bar-h h-5 rounded-sm"
                      style={{
                        gridColumn: `${colStart + 1} / ${colEnd + 2}`,
                        background: STATUS_COLOR[t.status],
                        opacity: hoverId != null && hoverId !== t.id ? 0.45 : 1,
                      }}
                      title={`${t.title} · ${STATUS_LABELS[t.status]} · ${fmtFull(start)} → ${fmtFull(end)} · ${nombreAsignado(t)}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {sinFecha.length > 0 && (
          <div className="mt-4 border-t border-border/60 pt-3">
            <p className="text-xs font-medium text-muted-foreground">
              Sin fecha ({sinFecha.length}) — no se pueden ubicar en el calendario
            </p>
            <ul className="mt-1.5 space-y-1">
              {sinFecha.map((t) => (
                <li key={t.id} className="text-xs text-muted-foreground">
                  {t.title} <span className="text-muted-foreground/70">· {nombreAsignado(t)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ChartTable
          caption="Actividades del cronograma"
          head={['Actividad', 'Estado', 'Inicio', 'Fin', 'Asignado']}
          rows={ubicables.map(({ task: t, start, end }) => [
            t.title,
            STATUS_LABELS[t.status],
            fmtFull(start),
            fmtFull(end),
            nombreAsignado(t),
          ])}
        />
      </CardContent>
    </Card>
  )
}
