import * as React from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Clock,
  Wallet,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { DOP } from './viz-tokens'
import type { AnalyticsReport } from './types'

/**
 * Acciones pendientes — la tira más accionable del panel.
 *
 * No es una gráfica: es una lista priorizada de "qué toca hacer hoy", con cada
 * ítem enlazado directo al registro correspondiente. Se construye solo con
 * datos que el endpoint ya devuelve (respetando el ámbito RBAC del usuario),
 * así que un USER ve únicamente lo suyo.
 *
 * Cada ítem lleva icono + etiqueta + cifra: la urgencia nunca depende solo del
 * color. Cuando no hay nada pendiente, se muestra un estado "todo al día"
 * explícito en vez de un hueco vacío.
 */

type Tone = 'danger' | 'warn' | 'info'

interface ActionItem {
  key: string
  tone: Tone
  icon: React.ComponentType<{ className?: string }>
  title: string
  figure: string
  detail: string
  href: string
}

const TONE: Record<Tone, string> = {
  danger: 'bg-destructive/10 text-destructive',
  warn: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  info: 'bg-primary/10 text-primary',
}

export function PendingActions({
  receivables,
  aging,
  overdueTasks,
}: {
  receivables: AnalyticsReport['receivables']
  aging: AnalyticsReport['quotesAging']
  overdueTasks: number
}) {
  const items: ActionItem[] = []

  if (overdueTasks > 0) {
    items.push({
      key: 'tasks',
      tone: 'danger',
      icon: AlertTriangle,
      title: 'Tareas vencidas',
      figure: String(overdueTasks),
      detail: 'Pasaron su fecha límite sin cerrarse',
      href: '/dashboard/tareas',
    })
  }

  if (aging.total > 0) {
    items.push({
      key: 'aging',
      tone: 'warn',
      icon: Clock,
      title: 'Cotizaciones sin respuesta',
      figure: String(aging.total),
      detail:
        `${DOP.format(aging.amount)} en juego` +
        (aging.stale > 0 ? ` · ${aging.stale} con más de 7 días` : ''),
      href: '/dashboard/cotizaciones',
    })
  }

  if (receivables.pending > 0) {
    items.push({
      key: 'receivables',
      tone: 'info',
      icon: Wallet,
      title: 'Cartera por cobrar',
      figure: DOP.format(receivables.pending),
      detail: `Aprobado en ${receivables.approvedCount} cotización${
        receivables.approvedCount === 1 ? '' : 'es'
      }, aún sin cobrar`,
      href: '/dashboard/pagos',
    })
  }

  return (
    <section aria-labelledby="acciones-pendientes">
      <h2
        id="acciones-pendientes"
        className="mb-2 text-sm font-semibold text-muted-foreground"
      >
        Acciones pendientes
      </h2>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-green-600/10 text-green-700 dark:text-green-400">
              <CheckCircle2 className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">Todo al día</p>
              <p className="text-xs text-muted-foreground">
                Sin tareas vencidas, cotizaciones sin responder ni cartera por
                cobrar.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.key}
                href={item.href}
                className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Card className="h-full transition-colors group-hover:bg-accent/40">
                  <CardContent className="flex items-start gap-3 p-4">
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${TONE[item.tone]}`}
                      aria-hidden="true"
                    >
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="mt-0.5 text-lg font-semibold leading-tight tabular-nums">
                        {item.figure}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.detail}
                      </p>
                    </div>
                    <ArrowRight
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
