import { FichasService } from './fichas.service';
import { UserRole } from '../users/entities/user.entity';

/** Paginación de GET /fichas (ERP-73) con repositorio simulado. */
function setup() {
  const repo = { findAndCount: jest.fn(async () => [[{ id: 'f1' }], 57]) };
  const svc = new FichasService(repo as never, {} as never);
  return { svc, repo };
}
const admin = { id: 'u1', role: UserRole.ADMIN } as never;
const tecnico = { id: 'u2', role: UserRole.USER } as never;

describe('FichasService.findAllPaged', () => {
  it('sin page/limit: sin skip/take (formato histórico, todas las fichas)', async () => {
    const { svc, repo } = setup();
    const r = await svc.findAllPaged({}, admin);
    const arg = (repo.findAndCount.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(arg).not.toHaveProperty('take');
    expect(arg).not.toHaveProperty('skip');
    expect(r.paged).toBe(false);
    expect(r.total).toBe(57);
  });

  it('con page y limit: calcula skip/take', async () => {
    const { svc, repo } = setup();
    const r = await svc.findAllPaged({ page: 3, limit: 20 }, admin);
    expect(repo.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ skip: 40, take: 20 }));
    expect(r.paged).toBe(true);
  });

  it('solo limit: página 1; limit se topa en 100', async () => {
    const { svc, repo } = setup();
    await svc.findAllPaged({ limit: 5000 }, admin);
    expect(repo.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 100 }));
  });

  it('un técnico (USER) solo ve sus fichas también paginando', async () => {
    const { svc, repo } = setup();
    await svc.findAllPaged({ page: 1, limit: 10 }, tecnico);
    const arg = (repo.findAndCount.mock.calls[0] as unknown[])[0] as { where: { technicianId: string } };
    expect(arg.where.technicianId).toBe('u2');
  });

  it('findAll devuelve solo el array', async () => {
    const { svc } = setup();
    expect(await svc.findAll({}, admin)).toEqual([{ id: 'f1' }]);
  });
});
