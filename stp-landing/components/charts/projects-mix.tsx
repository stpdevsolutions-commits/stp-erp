'use client'

import * as React from 'react'
import { ChartFrame } from './chart-frame'
import { SERIES, safePct } from './viz-tokens'
import {
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  type AnalyticsReport,
  type ProjectStatusKey,
} from './types'

const STATUS_ORDER: ProjectStatusKey[] = [
  'draft',
  'active',
  'on_hold',
  'completed',
  'cancelled',
]

/**
 * Proyectos por tipo y estado — barras horizontales apiladas.
 *
 * Cruzar las dos dimensiones en una sola gráfica responde la pregunta real
 * ("¿dónde está la carga viva del negocio?") mucho mejor que dos gráficas de
 * conteos por separado.
 *
 * Cinco series categóricas en su orden fijo, con leyenda siempre visible y
 * tabla gemela: la identidad nunca depende solo del color. Los segmentos se
 * separan con un hueco de 2px del color de la superficie, no con un borde.
 */
export function ProjectsMix({ projects }: { projects: AnalyticsReport['projects'] }) {
  const [hover, setHover] = React.useState<ProjectStatusKey | null>(null)
  const peak = projects.byType.reduce((m, t) => Math.max(m, t.total), 0)

  const colorOf = (s: ProjectStatusKey) =>
    SERIES[STATUS_ORDER.indexOf(s)] ?? SERIES[SERIES.length - 1]

  return (
    <ChartFrame
      title="Proyectos por tipo y estado"
      subtitle={`${projects.total} proyectos en total`}
      hasData={projects.hasData}
      legend={STATUS_ORDER.map((s) => ({
        label: PROJECT_STATUS_LABELS[s],
        color: colorOf(s),
      }))}
      empty={{
        message: 'Aún no hay proyectos registrados',
        hint: 'La distribución por tipo (eléctrico, mecánico, construcción…) y estado aparecerá al crear el primer proyecto.',
        action: { label: 'Ir a Proyectos', href: '/dashboard/proyectos' },
      }}
      table={{
        caption: 'Proyectos por tipo y estado',
        head: ['Tipo', ...STATUS_ORDER.map((s) => PROJECT_STATUS_LABELS[s]), 'Total'],
        rows: projects.byType.map((t) => [
          PROJECT_TYPE_LABELS[t.type] ?? t.type,
          ...STATUS_ORDER.map(
            (s) => t.byStatus.find((x) => x.status === s)?.count ?? 0,
          ),
          t.total,
        ]),
      }}
    >
      <ul className="space-y-3">
        {projects.byType.map((t) => (
          <li key={t.type}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate text-muted-foreground">
                {PROJECT_TYPE_LABELS[t.type] ?? t.type}
              </span>
              <strong className="shrink-0 tabular-nums">{t.total}</strong>
            </div>
            <div
              className="viz-stack mt-1 flex h-5"
              style={{ width: `${Math.max(safePct(t.total, peak), 4)}%` }}
            >
              {t.byStatus
                .filter((s) => s.count > 0)
                .map((s, idx, arr) => (
                  <span
                    key={s.status}
                    className={idx === arr.length - 1 ? 'viz-bar-h' : ''}
                    title={`${PROJECT_STATUS_LABELS[s.status]}: ${s.count}`}
                    onMouseEnter={() => setHover(s.status)}
                    onMouseLeave={() => setHover(null)}
                    style={{
                      flexGrow: s.count,
                      flexBasis: 0,
                      background: colorOf(s.status),
                      opacity: hover != null && hover !== s.status ? 0.45 : 1,
                    }}
                  />
                ))}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-border/60 pt-3">
        {projects.byStatus
          .filter((s) => s.count > 0)
          .map((s) => (
            <span key={s.status} className="flex items-baseline gap-1.5 text-xs">
              <span
                className="size-2 shrink-0 translate-y-px rounded-[2px]"
                style={{ background: colorOf(s.status) }}
              />
              <span className="text-muted-foreground">{PROJECT_STATUS_LABELS[s.status]}</span>
              <strong className="tabular-nums">{s.count}</strong>
            </span>
          ))}
      </div>
    </ChartFrame>
  )
}
