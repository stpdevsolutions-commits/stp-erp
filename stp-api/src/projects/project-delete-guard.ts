/** Registros que impiden borrar un proyecto, por tabla. */
export interface ProjectDeleteBlockers {
  expenses: number;
  payments: number;
  payrollEntries: number;
  salesInvoices: number;
  fiscalInvoices: number;
  fichas: number;
}

const LABELS: Array<[keyof ProjectDeleteBlockers, string, string]> = [
  ['expenses', 'gasto', 'gastos'],
  ['payments', 'pago de cliente', 'pagos de clientes'],
  ['payrollEntries', 'pago de nómina', 'pagos de nómina'],
  ['salesInvoices', 'factura de venta', 'facturas de venta'],
  ['fiscalInvoices', 'factura fiscal vinculada', 'facturas fiscales vinculadas'],
  ['fichas', 'ficha técnica', 'fichas técnicas'],
];

/**
 * Devuelve el mensaje de bloqueo para el 409, o `null` si el proyecto no tiene
 * nada que lo impida y se puede borrar.
 */
export function buildProjectDeleteBlockMessage(
  code: string,
  blockers: ProjectDeleteBlockers,
): string | null {
  const parts = LABELS.filter(([key]) => blockers[key] > 0).map(
    ([key, singular, plural]) => `${blockers[key]} ${blockers[key] === 1 ? singular : plural}`,
  );
  if (parts.length === 0) return null;
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
  return (
    `No se puede eliminar el proyecto ${code} porque tiene ${list}. ` +
    'Borrarlo eliminaría también esos registros (y el costo de mano de obra). ' +
    'Cámbialo a estado Cancelado o Completado en lugar de eliminarlo.'
  );
}
