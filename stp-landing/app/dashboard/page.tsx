export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ArrowRight, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import { visibleGroups } from '@/lib/nav'
import { Blueprint } from '@/components/brand/blueprint'
import { FrequentLinks } from '@/components/home/frequent-links'
import type { DashboardReport } from '@/lib/types'

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

type Me = {
  role: string
  firstName: string
  modules?: Record<string, string>
}

type HeroInfo = { hasImage: boolean; version: string | null; caption: string }

function todayLabel() {
  const text = new Intl.DateTimeFormat('es-DO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Santo_Domingo',
  }).format(new Date())
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Centro de operaciones: la entrada al ERP. La prioridad es llegar rápido al módulo
 * que se necesita; los números viven en Resumen y aquí solo se avisa de lo que pide
 * atención. Los módulos salen de `lib/nav.ts` (los mismos del menú lateral), filtrados
 * por la matriz de permisos del rol.
 */
export default async function InicioPage() {
  const [meR, heroR, dashR] = await Promise.allSettled([
    api.get<Me>('/users/me'),
    api.get<HeroInfo>('/settings/hero-info'),
    api.get<DashboardReport>('/reports/dashboard'),
  ])
  const me = meR.status === 'fulfilled' ? meR.value : null
  const hero = heroR.status === 'fulfilled' ? heroR.value : null
  const dash = dashR.status === 'fulfilled' ? dashR.value : null

  const areas = visibleGroups(me?.role ?? 'user', me?.modules).filter(
    (g) => g.label && g.label !== 'Cuenta',
  )

  const overdueTasks = dash?.tasks.overdue ?? 0
  const overduePayments = dash?.payments.overdueCount ?? 0
  const overdueAmount = dash?.payments.overdueAmount ?? 0
  const canSeeTasks = !me?.modules || (me.modules.tareas ?? 'none') !== 'none'
  const canSeeSummary = !me?.modules || (me.modules.reportes ?? 'none') !== 'none'
  const canSeePayments = !me?.modules || (me.modules.pagos ?? 'none') !== 'none'

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Héroe: foto del proyecto destacado (Configuración) o, sin ella, el plano de marca */}
      <section className="relative isolate flex min-h-[15rem] items-end overflow-hidden rounded-2xl text-white sm:min-h-[19rem]">
        <Blueprint variant="wide" />
        {hero?.hasImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/settings/hero?v=${hero.version ?? ''}`}
            alt={hero.caption || 'Proyecto destacado de STP'}
            className="absolute inset-0 size-full object-cover object-[50%_58%]"
            fetchPriority="high"
          />
        )}
        <div
          aria-hidden="true"
          className={`absolute inset-0 bg-gradient-to-t ${hero?.hasImage ? 'from-brand-deep/95 via-brand-deep/60 to-brand-deep/10' : 'from-brand-deep/90 via-brand-deep/40 to-transparent'}`}
        />
        <div className="relative z-10 w-full p-5 sm:p-8">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-brand-green-soft">
            {todayLabel()}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            {me ? `Hola, ${me.firstName}. ` : ''}Bienvenido a STP ERP
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/80 sm:text-base">
            Gestiona tus operaciones, proyectos y recursos desde un solo lugar.
          </p>
          {hero?.hasImage && hero.caption && (
            <p className="mt-4 text-xs text-white/60">{hero.caption}</p>
          )}
        </div>
      </section>

      {/* Atención: discreta, solo aparece lo que requiere algo del usuario */}
      <section
        aria-label="Atención"
        className="flex flex-wrap items-center gap-2 text-sm"
      >
        {canSeeTasks && overdueTasks > 0 && (
          <Link
            href="/dashboard/tareas?vencidas=1"
            className="inline-flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-destructive transition-colors hover:bg-destructive/15"
          >
            <AlertTriangle className="size-4" />
            {overdueTasks} {overdueTasks === 1 ? 'tarea vencida' : 'tareas vencidas'}
          </Link>
        )}
        {canSeePayments && overduePayments > 0 && (
          <Link
            href="/dashboard/pagos?vencidos=1"
            className="inline-flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-destructive transition-colors hover:bg-destructive/15"
          >
            <AlertTriangle className="size-4" />
            {overduePayments} {overduePayments === 1 ? 'cobro vencido' : 'cobros vencidos'} ·{' '}
            {DOP.format(overdueAmount)}
          </Link>
        )}
        {overdueTasks === 0 && overduePayments === 0 && dash && (
          <span className="text-muted-foreground">Sin tareas ni cobros vencidos.</span>
        )}
        {canSeeSummary && (
          <Link
            href="/dashboard/resumen"
            className="ml-auto inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground max-md:min-h-10"
          >
            Ver resumen <ArrowRight className="size-4" />
          </Link>
        )}
      </section>

      <FrequentLinks allowed={areas.flatMap((a) => a.items.map((i) => ({ href: i.href, label: i.label })))} />

      {/* Módulos por área de trabajo */}
      <section aria-label="Módulos" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {areas.map((area) => (
          <div key={area.label} className="rounded-xl border bg-card">
            <h2 className="border-b px-4 py-2.5 font-mono text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {area.label}
            </h2>
            <ul className="p-1.5">
              {area.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="group flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <item.icon className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium leading-tight">{item.label}</span>
                      {item.description && (
                        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                          {item.description}
                        </span>
                      )}
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  )
}
