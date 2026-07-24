/**
 * Tokens de color para las gráficas del ERP.
 *
 * Paleta derivada de la identidad STP (navy #0D3773, verde #157B52) y
 * **validada** con el validador del método de dataviz (OKLab ΔE ×100,
 * simulación Machado-Oliveira-Fernandes 2009 a severidad 1.0):
 *
 *   Categórica (orden fijo: verde, navy, ámbar, violeta, rojo)
 *     claro  sobre #ffffff : banda L OK · croma OK · CVD adyacente ΔE 16.5 ·
 *                            visión normal ΔE 19.5 · contraste ≥3:1  → PASS
 *     oscuro sobre #141b25 : banda L OK · croma OK · CVD adyacente ΔE 16.5 ·
 *                            visión normal ΔE 20.3 · contraste ≥3:1  → PASS
 *
 *   Rampa ordinal navy (embudo)  → PASS en ambos modos (--ordinal)
 *   Rampa ordinal ámbar (antigüedad) → PASS en ambos modos (--ordinal)
 *
 * El orden de los slots ES el mecanismo de seguridad para daltonismo: no se
 * reordena ni se generan tonos nuevos. Un 6º color no existe; si hiciera falta
 * se agrupa en "Otros" o se separa en gráficas pequeñas.
 *
 * El color sigue a la entidad, no a su posición: "ingresos" es siempre el
 * slot 1 (verde) y "gastos" siempre el slot 2 (navy) en todas las gráficas.
 */

const CSS = `
.stp-viz {
  --viz-surface: var(--card);
  --viz-grid: #e6e8ec;
  --viz-axis: #cbd0d8;
  /* categórica — claro */
  --viz-s1: #00774b;
  --viz-s2: #21539c;
  --viz-s3: #a75d00;
  --viz-s4: #6646a8;
  --viz-s5: #b52f48;
  /* rampa ordinal navy (etapas del embudo) */
  --viz-n1: #83adea;
  --viz-n2: #5c8ace;
  --viz-n3: #3868b0;
  --viz-n4: #1e4b8d;
  /* rampa ordinal ámbar (antigüedad / urgencia creciente) */
  --viz-a1: #dea66c;
  --viz-a2: #ca883f;
  --viz-a3: #b46900;
  --viz-a4: #935000;
}
.dark .stp-viz {
  --viz-grid: #262f3d;
  --viz-axis: #354152;
  --viz-s1: #32aa78;
  --viz-s2: #5992e7;
  --viz-s3: #cb8315;
  --viz-s4: #8e71d6;
  --viz-s5: #e35b6d;
  --viz-n1: #265496;
  --viz-n2: #3e71bc;
  --viz-n3: #568fe3;
  --viz-n4: #7daff9;
  --viz-a1: #864e00;
  --viz-a2: #ab6600;
  --viz-a3: #ce811e;
  --viz-a4: #eaa150;
}
/* Marca: extremo redondeado 4px del lado del dato, recto en la línea base. */
.stp-viz .viz-bar-h { border-radius: 0 4px 4px 0; }
.stp-viz .viz-bar-v { border-radius: 4px 4px 0 0; }
/* Separación entre marcas contiguas: 2px del color de la superficie,
   nunca un borde dibujado alrededor de la marca. */
.stp-viz .viz-stack > * + * { margin-left: 2px; }
@media (forced-colors: active) {
  .stp-viz .viz-bar-h,
  .stp-viz .viz-bar-v { forced-color-adjust: none; outline: 1px solid CanvasText; }
}
`

/** Inyecta los tokens una sola vez por página. */
export function VizTokens() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />
}

/** Slots categóricos en su orden fijo. */
export const SERIES = ['var(--viz-s1)', 'var(--viz-s2)', 'var(--viz-s3)', 'var(--viz-s4)', 'var(--viz-s5)'] as const
export const NAVY_RAMP = ['var(--viz-n1)', 'var(--viz-n2)', 'var(--viz-n3)', 'var(--viz-n4)'] as const
export const AMBER_RAMP = ['var(--viz-a1)', 'var(--viz-a2)', 'var(--viz-a3)', 'var(--viz-a4)'] as const

/** Formato de moneda dominicana: RD$ 1,234.56 */
export const DOP = new Intl.NumberFormat('es-DO', {
  style: 'currency',
  currency: 'DOP',
  minimumFractionDigits: 2,
})

/** Versión compacta para ejes y etiquetas dentro de marcas. */
export function dopShort(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `RD$ ${(v / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  if (abs >= 1_000) return `RD$ ${(v / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`
  return `RD$ ${v.toFixed(0)}`
}

/** Porcentaje seguro: nunca NaN ni Infinity. */
export function safePct(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0
  return Math.max(0, Math.min(100, (part / whole) * 100))
}

/**
 * Escala del eje Y redondeada a números limpios.
 * Devuelve `max` > 0 siempre, para que ninguna división produzca NaN.
 */
export function niceScale(maxValue: number, ticks = 4): { max: number; ticks: number[] } {
  const safe = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : 0
  if (safe === 0) return { max: 1, ticks: [0, 1] }
  const rough = safe / ticks
  const mag = Math.pow(10, Math.floor(Math.log10(rough)))
  const norm = rough / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag
  const max = Math.ceil(safe / step) * step
  const out: number[] = []
  for (let v = 0; v <= max + step / 2; v += step) out.push(Math.round(v * 100) / 100)
  return { max, ticks: out }
}
