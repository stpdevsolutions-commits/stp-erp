/**
 * Gastos generales (ERP-34): un gasto sin proyecto. Los selects de proyecto usan
 * este valor como opción "Sin proyecto" y se traduce a `projectId: null` al guardar.
 */
export const GENERAL_EXPENSE = '__general__'

/** Solo administración y finanzas registran o ven gastos generales. */
export function canUseGeneralExpenses(role?: string | null): boolean {
  const r = (role ?? '').toLowerCase()
  return r === 'admin' || r === 'finanza'
}
