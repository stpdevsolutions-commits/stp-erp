import { getProjects, getTickets } from '@/lib/actions/tickets'
import { getSprints } from '@/lib/actions/sprints'
import { Timeline } from '@/components/roadmap/timeline'
import { SprintSection } from '@/components/roadmap/sprint-section'
import { Changelog } from '@/components/roadmap/changelog'
import { ProjectProgress } from '@/components/roadmap/project-progress'
import { NuevaEtapaDialog } from '@/components/roadmap/nueva-etapa-dialog'
import { Meter } from '@/components/roadmap/meter'
import { summarize, longDate } from '@/lib/roadmap'
import type { Ticket } from '@/lib/types'

export const metadata = {
  title: 'Roadmap · STP Tickets',
  description: 'Etapas, línea de tiempo y registro de lo entregado en los proyectos de STP',
}

export default async function RoadmapPage() {
  const [projects, tickets, sprints] = await Promise.all([
    getProjects(),
    getTickets(),
    getSprints(),
  ])

  const ordered = [...sprints].sort((a, b) => {
    if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1
    return a.position - b.position
  })

  const bySprint = new Map<string, Ticket[]>()
  for (const t of tickets) {
    if (!t.sprintId) continue
    const list = bySprint.get(t.sprintId) ?? []
    list.push(t)
    bySprint.set(t.sprintId, list)
  }

  const s = summarize(ordered)

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Roadmap</h1>
          <p className="text-sm text-muted-foreground">
            Qué se hizo, qué está en marcha y cuánto falta en los proyectos de STP.
          </p>
        </div>
        {ordered.length > 0 && <NuevaEtapaDialog projects={projects} variant="outline" />}
      </div>

      {ordered.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <h2 className="text-base font-semibold">Todavía no hay etapas</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Una etapa agrupa tickets entre dos fechas. Con la primera empieza a construirse la
            línea de tiempo y el registro de entregas.
          </p>
          <div className="mt-5 flex justify-center">
            <NuevaEtapaDialog projects={projects} />
          </div>
        </div>
      ) : (
        <>
          {/* Resumen — el elemento con más peso de la página */}
          <div className="mt-8 border-y border-border py-6">
            <p className="max-w-2xl text-xl leading-snug sm:text-2xl">
              Llevamos <span className="font-semibold">{s.done}</span> de{' '}
              <span className="font-semibold">{s.total}</span>{' '}
              {s.total === 1 ? 'tarea' : 'tareas'} de la hoja de ruta.{' '}
              {s.remaining > 0 ? (
                <span className="text-muted-foreground">
                  {s.remaining === 1 ? 'Queda 1.' : `Quedan ${s.remaining}.`}
                </span>
              ) : (
                <span className="text-muted-foreground">Todo entregado.</span>
              )}
            </p>

            {s.total > 0 && (
              <div className="mt-4 max-w-2xl">
                <Meter
                  done={s.done}
                  inFlight={s.inFlight}
                  pending={s.pending}
                  total={s.total}
                  className="h-2.5"
                />
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[var(--chart-2)]" />
                    {s.done} resueltas
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-primary/70" />
                    {s.inFlight} en curso
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-muted-foreground/30" />
                    {s.pending} sin empezar
                  </span>
                </div>
              </div>
            )}

            <p className="mt-4 text-sm text-muted-foreground">
              {s.activeSprints === 0
                ? 'Ninguna etapa en marcha ahora mismo.'
                : `${s.activeSprints} ${s.activeSprints === 1 ? 'etapa' : 'etapas'} en marcha.`}
              {s.nextDeadline && ` Próxima fecha objetivo: ${longDate(s.nextDeadline)}.`}
            </p>
          </div>

          {/* Línea de tiempo */}
          <section className="mt-10">
            <h2 className="mb-4 text-sm font-semibold">Línea de tiempo</h2>
            <Timeline sprints={ordered} />
          </section>

          {/* Detalle de cada etapa */}
          <div className="mt-12 space-y-8">
            {ordered.map((sprint, i) => (
              <SprintSection
                key={sprint.id}
                sprint={sprint}
                index={i}
                tickets={bySprint.get(sprint.id) ?? []}
                projects={projects}
                allTickets={tickets}
              />
            ))}
          </div>

          {/* Entregas + avance por proyecto */}
          <div className="mt-14 grid gap-10 border-t border-border pt-8 lg:grid-cols-[1fr_260px]">
            <section>
              <h2 className="mb-4 text-sm font-semibold">Entregado</h2>
              <Changelog tickets={tickets} limitWeeks={8} />
            </section>
            <aside className="lg:border-l lg:border-border lg:pl-8">
              <h2 className="mb-4 text-sm font-semibold">Avance por proyecto</h2>
              <ProjectProgress sprints={ordered} tickets={tickets} />
            </aside>
          </div>
        </>
      )}
    </main>
  )
}
