import type { MaterialPrice } from '@/lib/types'

/**
 * Evolución del precio neto comparable de un material, una línea por proveedor.
 *
 * Se grafica SIEMPRE `netUnitPrice` (DOP, con descuento, sin ITBIS): el `price` crudo
 * mezcla monedas y bases de impuesto, así que ponerlo en un mismo eje no significa nada.
 * Los precios anulados no forman parte de la línea; si el usuario pidió verlos, salen
 * como aspas grises sueltas para que se distingan de un vistazo.
 *
 * SVG a mano y sin dependencias: el repo no tiene librería de gráficas y meter una
 * (recharts/chart.js) por un gráfico de líneas de dos series no se paga.
 */

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })
const DOP_COMPACT = new Intl.NumberFormat('es-DO', {
  style: 'currency',
  currency: 'DOP',
  maximumFractionDigits: 0,
})

/**
 * Orden fijo de colores (paleta categórica validada para daltonismo y para ambos modos).
 * El color va con el proveedor, nunca con su posición en el ranking: se asigna por nombre
 * ordenado, así que filtrar o añadir precios no repinta a los demás.
 * Las clases están escritas literales porque Tailwind las descubre leyendo el fuente.
 */
const SERIES_STYLES = [
  {
    stroke: 'stroke-[#2a78d6] dark:stroke-[#3987e5]',
    fill: 'fill-[#2a78d6] dark:fill-[#3987e5]',
    chip: 'bg-[#2a78d6] dark:bg-[#3987e5]',
  },
  {
    stroke: 'stroke-[#eb6834] dark:stroke-[#d95926]',
    fill: 'fill-[#eb6834] dark:fill-[#d95926]',
    chip: 'bg-[#eb6834] dark:bg-[#d95926]',
  },
  {
    stroke: 'stroke-[#1baf7a] dark:stroke-[#199e70]',
    fill: 'fill-[#1baf7a] dark:fill-[#199e70]',
    chip: 'bg-[#1baf7a] dark:bg-[#199e70]',
  },
  {
    stroke: 'stroke-[#eda100] dark:stroke-[#c98500]',
    fill: 'fill-[#eda100] dark:fill-[#c98500]',
    chip: 'bg-[#eda100] dark:bg-[#c98500]',
  },
  {
    stroke: 'stroke-[#e87ba4] dark:stroke-[#d55181]',
    fill: 'fill-[#e87ba4] dark:fill-[#d55181]',
    chip: 'bg-[#e87ba4] dark:bg-[#d55181]',
  },
  {
    stroke: 'stroke-[#4a3aa7] dark:stroke-[#9085e9]',
    fill: 'fill-[#4a3aa7] dark:fill-[#9085e9]',
    chip: 'bg-[#4a3aa7] dark:bg-[#9085e9]',
  },
] as const

const MAX_SERIES = SERIES_STYLES.length

// Lienzo. Se dibuja en coordenadas fijas y el SVG escala al ancho de la tarjeta.
const W = 760
const H = 280
const PAD = { top: 18, right: 132, bottom: 34, left: 68 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

interface Point {
  date: string
  value: number
  price: MaterialPrice
}

interface Series {
  key: string
  name: string
  points: Point[]
}

function day(iso: string): string {
  return iso.slice(0, 10)
}

function dayMs(iso: string): number {
  return new Date(`${day(iso)}T12:00:00Z`).getTime()
}

function fmtDate(iso: string): string {
  return new Date(`${day(iso)}T12:00:00Z`).toLocaleDateString('es-DO', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  })
}

/**
 * Una línea por proveedor. Si un proveedor tiene varios precios con la misma fecha de
 * vigencia se queda el capturado más tarde, que es el criterio de "vigente" del backend
 * (`pickCurrentPrice`): fecha y, a igualdad, orden de captura.
 */
function buildSeries(prices: MaterialPrice[]): Series[] {
  const groups = new Map<string, { name: string; byDate: Map<string, Point> }>()

  for (const p of prices) {
    const key = p.supplierId ?? '__sin_proveedor__'
    let group = groups.get(key)
    if (!group) {
      group = { name: p.supplier?.name ?? 'Sin proveedor', byDate: new Map() }
      groups.set(key, group)
    }
    const d = day(p.date)
    const previous = group.byDate.get(d)
    if (!previous || new Date(p.createdAt).getTime() >= new Date(previous.price.createdAt).getTime()) {
      group.byDate.set(d, { date: d, value: p.netUnitPrice, price: p })
    }
  }

  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      name: group.name,
      points: [...group.byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

export function GraficaPrecios({
  prices,
  unit,
}: {
  prices: MaterialPrice[]
  unit?: string
}) {
  const active = prices.filter((p) => !p.voidedAt)
  const voided = prices.filter((p) => Boolean(p.voidedAt))

  if (active.length === 0) {
    return (
      <p className="text-muted-foreground px-6 pb-6 text-sm">
        Aún no hay precios vigentes que graficar.
      </p>
    )
  }

  const allSeries = buildSeries(active)
  const series = allSeries.slice(0, MAX_SERIES)
  const hidden = allSeries.length - series.length

  const shownPrices = [...series.flatMap((s) => s.points.map((p) => p.price)), ...voided]
  const dates = [...new Set(shownPrices.map((p) => day(p.date)))].sort()
  const distinctDates = dates.length

  // Eje X temporal: las distancias son las reales, no posiciones de índice. Con una sola
  // fecha no hay recorrido que representar y todo se dibuja centrado.
  const xMin = dayMs(dates[0])
  const xMax = dayMs(dates[dates.length - 1])
  const spanX = xMax - xMin
  const xFor = (iso: string) =>
    spanX === 0 ? PAD.left + PLOT_W / 2 : PAD.left + ((dayMs(iso) - xMin) / spanX) * PLOT_W

  /**
   * Con una sola fecha todos los puntos caerían en la misma vertical y dos proveedores
   * que cotizan igual se taparían (pasa: hay materiales con precio idéntico en ambos).
   * Se abren en abanico alrededor del centro; el eje sigue rotulando la única fecha real.
   */
  const fanOut = (seriesIndex: number, seriesCount: number) =>
    spanX === 0 ? (seriesIndex - (seriesCount - 1) / 2) * 26 : 0

  const values = shownPrices.map((p) => p.netUnitPrice)
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  // Si todos los precios coinciden no hay rango: se abre una banda del ±5 % para que el
  // punto quede a media altura en vez de pegado a un borde.
  const pad = rawMax === rawMin ? Math.max(rawMax * 0.05, 1) : (rawMax - rawMin) * 0.12
  const yMin = Math.max(0, rawMin - pad)
  const yMax = rawMax + pad
  const spanY = yMax - yMin || 1
  const yFor = (v: number) => PAD.top + PLOT_H - ((v - yMin) / spanY) * PLOT_H

  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + (spanY * i) / 4)

  // Como mucho 4 fechas rotuladas, repartidas entre las que existen de verdad.
  const xTicks =
    distinctDates <= 4
      ? dates
      : Array.from({ length: 4 }, (_, i) => dates[Math.round((i * (distinctDates - 1)) / 3)])

  // Etiqueta directa al final de cada serie (con ≤6 series no hace falta pasar el ratón).
  // Si dos quedan encimadas se separan verticalmente para que ambas se lean.
  const labels = series
    .map((s, i) => {
      const last = s.points[s.points.length - 1]
      return { i, name: s.name, value: last.value, y: yFor(last.value) }
    })
    .sort((a, b) => a.y - b.y)
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].y - labels[i - 1].y < 30) labels[i].y = labels[i - 1].y + 30
  }

  return (
    <div className="px-6 pb-6">
      {distinctDates < 2 && (
        <p className="border-amber-500/30 bg-amber-500/10 text-foreground mb-4 rounded-md border px-3 py-2 text-xs">
          <strong>Todavía no hay evolución que mostrar.</strong> Los precios de este material
          tienen todos la misma fecha ({fmtDate(dates[0])}), así que la gráfica solo puede
          situar un punto por proveedor: sirve para comparar entre ellos, no para ver la
          tendencia. La curva aparecerá cuando se registre una segunda fecha —
          cotizaciones nuevas del proveedor o compras anotadas como gasto con cantidad y
          precio unitario.
        </p>
      )}

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="text-muted-foreground min-w-[560px] w-full"
          role="img"
          aria-label={`Evolución del precio neto por proveedor. ${series
            .map((s) => `${s.name}: ${s.points.length} precio(s)`)
            .join('. ')}`}
        >
          {/* Rejilla y eje de importes */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line
                x1={PAD.left}
                x2={PAD.left + PLOT_W}
                y1={yFor(v)}
                y2={yFor(v)}
                className="stroke-border"
                strokeWidth={1}
                opacity={i === 0 ? 1 : 0.45}
              />
              <text
                x={PAD.left - 8}
                y={yFor(v) + 4}
                textAnchor="end"
                className="fill-current text-[11px]"
              >
                {DOP_COMPACT.format(v)}
              </text>
            </g>
          ))}

          {/* Eje de fechas */}
          {xTicks.map((d) => (
            <text
              key={d}
              x={xFor(d)}
              y={PAD.top + PLOT_H + 20}
              textAnchor="middle"
              className="fill-current text-[11px]"
            >
              {fmtDate(d)}
            </text>
          ))}

          {/* Precios anulados: fuera de la línea y marcados como aspas grises */}
          {voided.map((p) => {
            const owner = series.findIndex((s) => s.key === (p.supplierId ?? '__sin_proveedor__'))
            const x = xFor(p.date) + (owner >= 0 ? fanOut(owner, series.length) : 0)
            const y = yFor(p.netUnitPrice)
            return (
              <g key={p.id} className="stroke-muted-foreground" strokeWidth={1.5} opacity={0.55}>
                <title>{`Anulado · ${p.supplier?.name ?? 'Sin proveedor'} · ${DOP.format(p.netUnitPrice)} · ${fmtDate(p.date)}`}</title>
                <line x1={x - 4} y1={y - 4} x2={x + 4} y2={y + 4} />
                <line x1={x - 4} y1={y + 4} x2={x + 4} y2={y - 4} />
              </g>
            )
          })}

          {/* Una línea por proveedor. Con un solo punto no hay línea: solo el marcador. */}
          {series.map((s, i) => {
            const style = SERIES_STYLES[i]
            const dx = fanOut(i, series.length)
            const d = s.points
              .map((p, j) => `${j === 0 ? 'M' : 'L'}${xFor(p.date) + dx},${yFor(p.value)}`)
              .join(' ')
            return (
              <g key={s.key}>
                {s.points.length > 1 && (
                  <path
                    d={d}
                    fill="none"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={style.stroke}
                  />
                )}
                {s.points.map((p) => (
                  <circle
                    key={p.price.id}
                    cx={xFor(p.date) + dx}
                    cy={yFor(p.value)}
                    r={s.points.length === 1 ? 6 : 4.5}
                    strokeWidth={2}
                    className={`${style.fill} stroke-card`}
                  >
                    <title>{`${s.name} · ${DOP.format(p.value)}${unit ? ` / ${unit}` : ''} · ${fmtDate(p.date)}`}</title>
                  </circle>
                ))}
              </g>
            )
          })}

          {/* Etiqueta directa: quién es cada línea y en cuánto termina */}
          {labels.map((l) => (
            <text
              key={l.i}
              x={PAD.left + PLOT_W + 10}
              y={l.y}
              className="fill-current text-[11px]"
            >
              <tspan className="fill-foreground font-medium">{l.name}</tspan>
              <tspan x={PAD.left + PLOT_W + 10} dy={13}>
                {DOP.format(l.value)}
              </tspan>
            </text>
          ))}
        </svg>
      </div>

      <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {series.map((s, i) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className={`inline-block size-2.5 rounded-full ${SERIES_STYLES[i].chip}`} />
            {s.name}
          </span>
        ))}
        {voided.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rotate-45 border-l border-t border-current" />
            Anulados (no cuentan)
          </span>
        )}
      </div>

      <p className="text-muted-foreground mt-2 text-xs">
        Precio neto comparable{unit ? ` por ${unit}` : ''}: en pesos, con descuento aplicado y
        sin ITBIS. El detalle de cada punto está en el historial de abajo.
        {hidden > 0 && ` No se grafican ${hidden} proveedor(es) más para no saturar la vista.`}
      </p>
    </div>
  )
}
