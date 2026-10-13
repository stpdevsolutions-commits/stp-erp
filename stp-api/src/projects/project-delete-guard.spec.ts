import { buildProjectDeleteBlockMessage, ProjectDeleteBlockers } from './project-delete-guard';

const none: ProjectDeleteBlockers = {
  expenses: 0,
  payments: 0,
  payrollEntries: 0,
  salesInvoices: 0,
  fiscalInvoices: 0,
  fichas: 0,
};

describe('buildProjectDeleteBlockMessage', () => {
  it('devuelve null si no hay nada que lo impida', () => {
    expect(buildProjectDeleteBlockMessage('PRJ-2026-001', none)).toBeNull();
  });

  it('nombra un solo bloqueo en singular', () => {
    const msg = buildProjectDeleteBlockMessage('PRJ-2026-001', { ...none, expenses: 1 });
    expect(msg).toContain('PRJ-2026-001');
    expect(msg).toContain('tiene 1 gasto.');
  });

  it('lista varios con cantidades y coma/"y"', () => {
    const msg = buildProjectDeleteBlockMessage('PRJ-2026-002', {
      ...none,
      expenses: 12,
      payrollEntries: 3,
      salesInvoices: 1,
    });
    expect(msg).toContain('12 gastos, 3 pagos de nómina y 1 factura de venta');
  });
});
