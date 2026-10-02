/**
 * Cartera por cobrar, cruzada POR PROYECTO (o por cotización si no tiene
 * proyecto): comparar sumas globales daba "100% cobrado" con cobros de
 * proyectos que no tenían nada contratado.
 *
 * - Contratado de un proyecto = lo mayor entre su presupuesto y la suma de sus
 *   cotizaciones aprobadas (suelen ser la misma cifra).
 * - Una cotización aprobada sin proyecto cuenta sola.
 * - Lo cobrado se aplica a su destino hasta el monto contratado; el resto
 *   (proyecto sin contrato, pago suelto o exceso) es `unallocated`.
 */
export interface ReceivablesInput {
  budgetedProjects: { id: string; budget: number }[];
  approvedQuotes: { id: string; projectId: string | null; total: number }[];
  collectedPayments: {
    projectId: string | null;
    quoteId: string | null;
    total: number;
    count: number;
  }[];
}

export interface ReceivablesResult {
  approved: number;
  approvedCount: number;
  collected: number;
  collectedCount: number;
  collectedTotal: number;
  unallocated: number;
  pending: number;
}

export function computeReceivables(input: ReceivablesInput): ReceivablesResult {
  const contracted = new Map<string, number>();
  for (const r of input.budgetedProjects) contracted.set(`p:${r.id}`, r.budget);

  const quotesByProject = new Map<string, number>();
  for (const q of input.approvedQuotes) {
    if (q.projectId) {
      quotesByProject.set(q.projectId, (quotesByProject.get(q.projectId) ?? 0) + q.total);
    } else {
      contracted.set(`q:${q.id}`, q.total);
    }
  }
  for (const [projectId, total] of quotesByProject) {
    const key = `p:${projectId}`;
    contracted.set(key, Math.max(contracted.get(key) ?? 0, total));
  }

  const collectedByKey = new Map<string, number>();
  let collectedTotal = 0;
  let collectedCount = 0;
  for (const r of input.collectedPayments) {
    const key = r.projectId ? `p:${r.projectId}` : r.quoteId ? `q:${r.quoteId}` : 'none';
    collectedByKey.set(key, (collectedByKey.get(key) ?? 0) + r.total);
    collectedTotal += r.total;
    collectedCount += r.count;
  }

  let approved = 0;
  let collected = 0;
  for (const [key, amount] of contracted) {
    approved += amount;
    collected += Math.min(collectedByKey.get(key) ?? 0, amount);
  }

  return {
    approved,
    approvedCount: contracted.size,
    collected,
    collectedCount,
    collectedTotal,
    unallocated: Math.max(0, collectedTotal - collected),
    pending: Math.max(0, approved - collected),
  };
}
