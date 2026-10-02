/**
 * Fechas de calendario en hora de República Dominicana (UTC-4, sin horario
 * de verano).
 *
 * El servidor corre en UTC: `new Date().toISOString().slice(0, 10)` da el día
 * SIGUIENTE a partir de las 8:00 p. m. en RD. Eso movía "hoy" en el Resumen,
 * el "este mes" de Gastos/Nómina, el vencimiento de cotizaciones y la fecha de
 * pago por defecto. Todo "hoy" de negocio sale de aquí.
 */
export const RD_TIME_ZONE = 'America/Santo_Domingo';

const ymd = new Intl.DateTimeFormat('en-CA', {
  timeZone: RD_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Hoy en RD como YYYY-MM-DD. */
export function todayRD(now: Date = new Date()): string {
  return ymd.format(now);
}

/** Primer día del mes en curso en RD, YYYY-MM-01. */
export function monthStartRD(now: Date = new Date()): string {
  return `${todayRD(now).slice(0, 8)}01`;
}

/** Primer día del año en curso en RD, YYYY-01-01. */
export function yearStartRD(now: Date = new Date()): string {
  return `${todayRD(now).slice(0, 4)}-01-01`;
}

/**
 * La fecha de hoy en RD como un Date a medianoche UTC: sirve para aritmética
 * de meses con getUTC*() sin que el desfase horario cambie el mes.
 */
export function todayRDAsUTCDate(now: Date = new Date()): Date {
  return new Date(`${todayRD(now)}T00:00:00Z`);
}
