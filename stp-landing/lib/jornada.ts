/**
 * Jornada laboral de STP, para calcular los días de un período de nómina.
 *
 * Lunes a viernes es día completo (8 h) y el sábado medio (4 h). El domingo vale
 * 0: no es que no se trabaje, es que cuando se trabaja se paga como horas extras,
 * que van en su propia casilla. Sumarlo aquí lo pagaría dos veces.
 */

export const HORAS_DIA_COMPLETO = 8
export const HORAS_MEDIO_DIA = 4

/** Peso de cada día de la semana, con `getUTCDay()`: 0 = domingo. */
const PESO_POR_DIA = [0, 1, 1, 1, 1, 1, 0.5]

export interface JornadaPeriodo {
  /** Días computables: 1 por día de L-V, 0.5 por sábado. */
  dias: number
  /** Las mismas horas, para poder explicárselo a quien cobra. */
  horas: number
  completos: number
  medios: number
  /** Domingos del período: no suman días, se pagan como extras. */
  domingos: number
}

/**
 * Días laborables entre dos fechas (ambas incluidas), en formato YYYY-MM-DD.
 *
 * Se recorre en UTC a propósito: las fechas del período son días de calendario
 * sin hora, y construirlas en horario local hace que en zonas al oeste de
 * Greenwich —como República Dominicana— caigan en el día anterior.
 */
export function calcularJornada(inicio: string, fin: string): JornadaPeriodo | null {
  const vacio = { dias: 0, horas: 0, completos: 0, medios: 0, domingos: 0 }
  if (!inicio || !fin) return null

  const desde = new Date(`${inicio.slice(0, 10)}T00:00:00Z`)
  const hasta = new Date(`${fin.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) return null
  if (hasta < desde) return null

  // Un período larguísimo suele ser un año mal tecleado; no vale la pena iterarlo.
  const dias = Math.round((hasta.getTime() - desde.getTime()) / 86_400_000) + 1
  if (dias > 366) return null

  const total = { ...vacio }
  for (let i = 0; i < dias; i += 1) {
    const dia = new Date(desde.getTime() + i * 86_400_000)
    const peso = PESO_POR_DIA[dia.getUTCDay()]
    if (peso === 1) total.completos += 1
    else if (peso === 0.5) total.medios += 1
    else total.domingos += 1
    total.dias += peso
  }

  total.horas = total.completos * HORAS_DIA_COMPLETO + total.medios * HORAS_MEDIO_DIA
  return total
}

/** Resumen corto para mostrar bajo el campo: "5 completos + 1 sábado · 44 h". */
export function describirJornada(j: JornadaPeriodo): string {
  const partes: string[] = []
  if (j.completos) partes.push(`${j.completos} ${j.completos === 1 ? 'día' : 'días'} completos`)
  if (j.medios) partes.push(`${j.medios} ${j.medios === 1 ? 'sábado' : 'sábados'} (medio día)`)
  if (partes.length === 0) partes.push('sin días laborables')

  const extra = j.domingos
    ? ` · ${j.domingos} ${j.domingos === 1 ? 'domingo' : 'domingos'} fuera (van en horas extras)`
    : ''

  return `${partes.join(' + ')} · ${j.horas} h${extra}`
}
