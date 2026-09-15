import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartEmpty } from '@/components/charts/chart-frame'
import type { Project, Task } from '@/lib/types'

/**
 * Avance vs. tiempo transcurrido — compara qué tanto del trabajo está hecho
 * contra qué tanto del plazo ya pasó, para decir si el proyecto va
 * adelantado o atrasado (no solo "cuánto se ha hecho").
 *
 * Requiere que el proyecto tenga fecha de inicio Y de fin: sin ambas no hay
 * plazo contra el cual proyectar, y se dice explícitamente en vez de asumir
 * una fecha que nadie puso.
 */
export function AvanceProyeccion({ project, tasks }: { project: Project; tasks: Task[] }) {
  // Una cancelada nunca va a completarse: contarla en el total castiga el avance con un
  // techo que ya no puede alcanzar el 100%, aunque todo lo demás esté hecho.
  const vigentes = tasks.filter((t) => t.status !== 'cancelled')
  const total = vigentes.length
  const done = vigentes.filter((t) => t.status === 'done').length
  const avancePct = total > 0 ? Math.round((done / total) * 1000) / 10 : null

  let tiempoPct: number | null = null
  if (project.startDate && project.endDate) {
    const start = new Date(`${project.startDate}T00:00:00`).getTime()
    const end = new Date(`${project.endDate}T00:00:00`).getTime()
    const totalMs = end - start
    if (totalMs > 0) {
      const elapsedMs = Math.min(Math.max(Date.now() - start, 0), totalMs)
      tiempoPct = Math.round((elapsedMs / totalMs) * 1000) / 10
    } else {
      tiempoPct = Date.now() >= start ? 100 : 0
    }
  }

  const puedeProyectar = avancePct != null && tiempoPct != null
  const diff = puedeProyectar ? Math.round((avancePct! - tiempoPct!) * 10) / 10 : null
  const estado: 'adelantado' | 'atrasado' | 'al_dia' | null =
    diff == null ? null : diff > 5 ? 'adelantado' : diff < -5 ? 'atrasado' : 'al_dia'

  const ESTADO_COLOR: Record<string, string> = {
    adelantado: 'var(--viz-s1)',
    atrasado: 'var(--viz-s5)',
    al_dia: 'var(--viz-s2)',
  }

  return (
    <Card className="stp-viz">
      <CardHeader className="gap-1">
        <CardTitle className="text-base">Avance vs. tiempo transcurrido</CardTitle>
        <p className="text-xs text-muted-foreground">
          Compara qué tanto se ha completado contra qué tanto del plazo ya pasó
        </p>
      </CardHeader>
      <CardContent>
        {!puedeProyectar ? (
          <ChartEmpty
            message={
              avancePct == null
                ? 'Aún no hay actividades registradas'
                : 'Falta la fecha de inicio o de fin del proyecto'
            }
            hint={
              avancePct == null
                ? 'El avance se calcula sobre las actividades del proyecto.'
                : 'Agrega ambas fechas al proyecto para poder proyectar si va adelantado o atrasado.'
            }
          />
        ) : (
          <>
            <p
              className="mb-3 text-sm font-medium"
              style={{ color: estado ? ESTADO_COLOR[estado] : undefined }}
            >
              {estado === 'adelantado' && `${Math.abs(diff!)}% adelantado sobre lo previsto`}
              {estado === 'atrasado' && `${Math.abs(diff!)}% atrasado sobre lo previsto`}
              {estado === 'al_dia' && 'Al día con lo previsto'}
            </p>

            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-baseline justify-between text-xs">
                  <span className="text-muted-foreground">Avance real (actividades completadas)</span>
                  <strong className="tabular-nums">{avancePct}%</strong>
                </div>
                <div className="h-4 rounded-sm bg-muted/60">
                  <div
                    className="viz-bar-h h-full"
                    style={{ width: `${avancePct}%`, background: 'var(--viz-s1)' }}
                  />
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-baseline justify-between text-xs">
                  <span className="text-muted-foreground">Tiempo transcurrido del plazo</span>
                  <strong className="tabular-nums">{tiempoPct}%</strong>
                </div>
                <div className="h-4 rounded-sm bg-muted/60">
                  <div
                    className="viz-bar-h h-full"
                    style={{ width: `${tiempoPct}%`, background: 'var(--viz-s2)' }}
                  />
                </div>
              </div>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              {done} de {total} actividad{total === 1 ? '' : 'es'} completada{total === 1 ? '' : 's'}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
