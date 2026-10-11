import Link from 'next/link'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { getProjects, getTickets } from '@/lib/actions/tickets'
import { NAV } from '@/lib/nav'
import { isOpen, ticketCode } from '@/lib/ticket-code'
import { Blueprint } from '@/components/brand/blueprint'
import { Badge } from '@/components/ui/badge'
import { NuevoTicketDialog } from '@/components/tickets/nuevo-ticket-dialog'
import { STATUS_BADGE, STATUS_LABELS } from '@/components/tickets/labels'

export const dynamic = 'force-dynamic'

function todayLabel() {
  const text = new Intl.DateTimeFormat('es-DO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Santo_Domingo',
  }).format(new Date())
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const OPEN_QS = 'status=pending,in_progress,review'

/**
 * Centro de operaciones de Tickets: la entrada al sistema. Llega rápido a la lista, al roadmap o
 * a los tickets de un proyecto, y avisa solo de lo que pide atención. Los números detallados
 * viven en cada sección.
 */
export default async function InicioPage() {
  const [projects, tickets] = await Promise.all([getProjects(), getTickets()])
  const byProject = new Map(projects.map((p) => [p.id, p]))

  const open = tickets.filter(isOpen)
  const urgent = open.filter((t) => t.priority === 'urgent').length
  const inReview = tickets.filter((t) => t.status === 'review').length

  const perProject = projects
    .map((p) => ({ ...p, open: open.filter((t) => t.projectId === p.id).length }))
    .sort((a, b) => b.open - a.open || a.code.localeCompare(b.code))

  const recent = [...tickets].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)).slice(0, 6)
  const sections = NAV.filter((g) => g.label).flatMap((g) => g.items)

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-6">
      {/* Héroe: imagen institucional de STP sobre el plano de marca */}
      <section className="relative isolate flex min-h-[15rem] items-end overflow-hidden rounded-2xl text-white sm:min-h-[19rem]">
        <Blueprint variant="wide" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hero.jpg"
          alt="Obra civil en ejecución"
          className="absolute inset-0 size-full object-cover object-[50%_58%]"
          fetchPriority="high"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-brand-deep/95 via-brand-deep/60 to-brand-deep/10"
        />
        <div className="relative z-10 w-full p-5 sm:p-8">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-brand-green-soft">{todayLabel()}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Bienvenido a STP Tickets</h1>
          <p className="mt-2 max-w-xl text-sm text-white/80 sm:text-base">
            Reporta y sigue bugs, cambios y mejoras de todos los proyectos desde un solo lugar.
          </p>
        </div>
      </section>

      {/* Atención: discreta, solo aparece lo que pide algo */}
      <section aria-label="Atención" className="flex flex-wrap items-center gap-2 text-sm">
        {urgent > 0 && (
          <Link
            href={`/tickets?${OPEN_QS}&sort=priority_desc`}
            className="inline-flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-destructive transition-colors hover:bg-destructive/15"
          >
            <AlertTriangle className="size-4" />
            {urgent} {urgent === 1 ? 'urgente abierto' : 'urgentes abiertos'}
          </Link>
        )}
        {inReview > 0 && (
          <Link
            href="/tickets?status=review"
            className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 transition-colors hover:bg-muted"
          >
            {inReview} {inReview === 1 ? 'ticket en revisión' : 'tickets en revisión'}
          </Link>
        )}
        {urgent === 0 && inReview === 0 && <span className="text-muted-foreground">Nada urgente ni en revisión.</span>}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-muted-foreground">
            {open.length} {open.length === 1 ? 'ticket abierto' : 'tickets abiertos'}
          </span>
          <NuevoTicketDialog projects={projects} />
        </div>
      </section>

      <section aria-label="Secciones" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border bg-card">
          <h2 className="border-b px-4 py-2.5 font-mono text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Trabajo
          </h2>
          <ul className="p-1.5">
            {sections.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.linkHref ?? item.href}
                  className="group flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <item.icon className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-tight">{item.label}</span>
                    {item.description && (
                      <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{item.description}</span>
                    )}
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border bg-card">
          <h2 className="border-b px-4 py-2.5 font-mono text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Proyectos
          </h2>
          <ul className="max-h-[22rem] overflow-y-auto p-1.5">
            {perProject.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/tickets?project=${p.id}`}
                  className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-muted max-md:py-3"
                >
                  <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">{p.code}</span>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {p.open > 0 ? (
                    <Badge variant="secondary">{p.open} abiertos</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">al día</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border bg-card md:col-span-2 xl:col-span-1">
          <h2 className="border-b px-4 py-2.5 font-mono text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Actividad reciente
          </h2>
          <ul className="p-1.5">
            {recent.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/tickets/${t.id}`}
                  className="flex items-start gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted"
                >
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm">{t.title}</span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {ticketCode(t, t.projectId ? byProject.get(t.projectId) : undefined)}
                    </span>
                  </span>
                  <Badge variant={STATUS_BADGE[t.status]}>{STATUS_LABELS[t.status]}</Badge>
                </Link>
              </li>
            ))}
            {recent.length === 0 && <li className="px-2.5 py-6 text-center text-sm text-muted-foreground">Aún no hay tickets.</li>}
          </ul>
        </div>
      </section>
    </main>
  )
}
