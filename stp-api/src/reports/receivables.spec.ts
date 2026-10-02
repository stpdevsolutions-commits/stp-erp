import { computeReceivables } from './receivables';

describe('computeReceivables', () => {
  it('no da "100% cobrado" con cobros de proyectos sin contrato', () => {
    // Caso real del 2026-10-01: RD$52k aprobados y RD$958k cobrados en OTROS proyectos.
    const r = computeReceivables({
      budgetedProjects: [],
      approvedQuotes: [{ id: 'q1', projectId: 'p6', total: 52_248.5 }],
      collectedPayments: [
        { projectId: 'p8', quoteId: null, total: 650_000, count: 2 },
        { projectId: 'p10', quoteId: null, total: 300_000, count: 1 },
      ],
    });
    expect(r.approved).toBe(52_248.5);
    expect(r.collected).toBe(0);
    expect(r.pending).toBe(52_248.5);
    expect(r.unallocated).toBe(950_000);
  });

  it('un proyecto vale lo mayor entre presupuesto y cotizaciones aprobadas', () => {
    const r = computeReceivables({
      budgetedProjects: [{ id: 'p1', budget: 100 }],
      approvedQuotes: [{ id: 'q1', projectId: 'p1', total: 150 }],
      collectedPayments: [],
    });
    expect(r.approved).toBe(150);
    expect(r.approvedCount).toBe(1);
  });

  it('lo cobrado por encima del contrato va a unallocated, no reduce otros pendientes', () => {
    const r = computeReceivables({
      budgetedProjects: [
        { id: 'p1', budget: 3_000 },
        { id: 'p2', budget: 1_000 },
      ],
      approvedQuotes: [],
      collectedPayments: [{ projectId: 'p1', quoteId: null, total: 300_000, count: 1 }],
    });
    expect(r.collected).toBe(3_000);
    expect(r.pending).toBe(1_000);
    expect(r.unallocated).toBe(297_000);
  });

  it('una cotización aprobada sin proyecto se cruza contra pagos de esa cotización', () => {
    const r = computeReceivables({
      budgetedProjects: [],
      approvedQuotes: [{ id: 'q9', projectId: null, total: 500 }],
      collectedPayments: [{ projectId: null, quoteId: 'q9', total: 200, count: 1 }],
    });
    expect(r.collected).toBe(200);
    expect(r.pending).toBe(300);
    expect(r.unallocated).toBe(0);
  });
});
