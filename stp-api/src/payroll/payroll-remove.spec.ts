import { NotFoundException } from '@nestjs/common';
import { PayrollService } from './payroll.service';

/** PayrollService.remove con dependencias simuladas: una sola transacción (ERP-74). */
function setup(entry: Record<string, unknown> | null, opts: { refundFails?: boolean; txFails?: boolean } = {}) {
  const payrollRepo = {
    findOne: jest.fn(async () => (entry ? { ...entry } : null)),
    remove: jest.fn(async () => undefined),
  };
  const collabRepo = { findOne: jest.fn(async () => ({ id: 'c1' })) };
  const em = {
    getRepository: jest.fn((e: { name: string }) => (e.name === 'PayrollEntry' ? payrollRepo : collabRepo)),
  };
  let committed = false;
  const dataSource = {
    transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) => {
      const r = await fn(em); // si lanza, equivale a rollback: no se llega al commit
      committed = true;
      return r;
    }),
  };
  const loansService = {
    refundInstallment: jest.fn(async () => {
      if (opts.refundFails) throw new Error('fallo préstamo');
    }),
  };
  const expensesService = { remove: jest.fn(async () => undefined) };
  const svc = new PayrollService(
    {} as never, {} as never, {} as never,
    expensesService as never, {} as never, loansService as never, dataSource as never,
  );
  return { svc, payrollRepo, loansService, expensesService, em, isCommitted: () => committed };
}

const entry = { id: 'p1', collaboratorId: 'c1', loanId: 'l1', loanDeductionAmount: 500, expenseId: 'e1' };

describe('PayrollService.remove (transaccional)', () => {
  it('devuelve la cuota con el manager de la transacción, borra el pago y después el gasto', async () => {
    const { svc, payrollRepo, loansService, expensesService, em, isCommitted } = setup(entry);
    await svc.remove('p1');
    expect(loansService.refundInstallment).toHaveBeenCalledWith('l1', 500, em);
    expect(payrollRepo.remove).toHaveBeenCalledTimes(1);
    expect(isCommitted()).toBe(true);
    expect(expensesService.remove).toHaveBeenCalledWith('e1');
  });

  it('sin préstamo ni gasto solo borra el pago', async () => {
    const { svc, payrollRepo, loansService, expensesService } = setup({ id: 'p1', collaboratorId: 'c1' });
    await svc.remove('p1');
    expect(loansService.refundInstallment).not.toHaveBeenCalled();
    expect(payrollRepo.remove).toHaveBeenCalled();
    expect(expensesService.remove).not.toHaveBeenCalled();
  });

  it('si falla la devolución de la cuota: error, no se borra el pago ni el gasto (rollback)', async () => {
    const { svc, payrollRepo, expensesService, isCommitted } = setup(entry, { refundFails: true });
    await expect(svc.remove('p1')).rejects.toThrow('fallo préstamo');
    expect(payrollRepo.remove).not.toHaveBeenCalled();
    expect(isCommitted()).toBe(false);
    expect(expensesService.remove).not.toHaveBeenCalled();
  });

  it('si no existe el pago: 404 sin tocar nada', async () => {
    const { svc, loansService, expensesService } = setup(null);
    await expect(svc.remove('x')).rejects.toBeInstanceOf(NotFoundException);
    expect(loansService.refundInstallment).not.toHaveBeenCalled();
    expect(expensesService.remove).not.toHaveBeenCalled();
  });

  it('si el gasto no se puede borrar tras el commit, no falla (queda en el log)', async () => {
    const s = setup(entry);
    s.expensesService.remove.mockRejectedValueOnce(new Error('ya no existe'));
    await expect(s.svc.remove('p1')).resolves.toBeUndefined();
  });
});
