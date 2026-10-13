import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OpenRegistrationGuard } from './open-registration.guard';
import { UserRole } from '../../users/entities/user.entity';

const SECRET = 'test-secret-no-real';
const jwt = new JwtService({ secret: SECRET, signOptions: { expiresIn: '1h' } });

function ctxWith(authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: authorization ? { authorization } : {} }) }),
  } as unknown as ExecutionContext;
}

function setup(opts: { count?: number; user?: Record<string, unknown> | null } = {}) {
  const usersService = {
    count: jest.fn().mockResolvedValue(opts.count ?? 3),
    findByIdOptional: jest.fn().mockResolvedValue(opts.user === undefined ? null : opts.user),
  };
  const config = { getOrThrow: jest.fn().mockReturnValue(SECRET) };
  const guard = new OpenRegistrationGuard(usersService as never, jwt, config as never);
  return { guard, usersService };
}

const bearer = (payload: Record<string, unknown>) => `Bearer ${jwt.sign(payload)}`;

describe('OpenRegistrationGuard', () => {
  it('bootstrap: con 0 usuarios permite registrar sin token', async () => {
    const { guard, usersService } = setup({ count: 0 });
    await expect(guard.canActivate(ctxWith())).resolves.toBe(true);
    expect(usersService.findByIdOptional).not.toHaveBeenCalled();
  });

  it('admin activo (segun la BD) permitido', async () => {
    const { guard, usersService } = setup({ user: { id: 'a1', role: UserRole.ADMIN, isActive: true } });
    await expect(guard.canActivate(ctxWith(bearer({ sub: 'a1', role: 'admin' })))).resolves.toBe(true);
    expect(usersService.findByIdOptional).toHaveBeenCalledWith('a1');
  });

  it('admin degradado a user denegado aunque su JWT siga diciendo admin', async () => {
    const { guard } = setup({ user: { id: 'a1', role: UserRole.USER, isActive: true } });
    await expect(guard.canActivate(ctxWith(bearer({ sub: 'a1', role: 'admin' })))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('admin desactivado denegado', async () => {
    const { guard } = setup({ user: { id: 'a1', role: UserRole.ADMIN, isActive: false } });
    await expect(guard.canActivate(ctxWith(bearer({ sub: 'a1', role: 'admin' })))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it.each([UserRole.MANAGER, UserRole.FINANZA, UserRole.USER])('rol %s denegado', async (role) => {
    const { guard } = setup({ user: { id: 'x', role, isActive: true } });
    await expect(guard.canActivate(ctxWith(bearer({ sub: 'x' })))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('token con `type` (reset de clave / decision de cotizacion) denegado sin consultar la BD', async () => {
    const { guard, usersService } = setup({ user: { id: 'a1', role: UserRole.ADMIN, isActive: true } });
    await expect(
      guard.canActivate(ctxWith(bearer({ sub: 'a1', type: 'password-reset', pv: 'x' }))),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(usersService.findByIdOptional).not.toHaveBeenCalled();
  });

  it('sin token denegado', async () => {
    const { guard } = setup();
    await expect(guard.canActivate(ctxWith())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('esquema distinto de Bearer denegado', async () => {
    const { guard } = setup({ user: { id: 'a1', role: UserRole.ADMIN, isActive: true } });
    await expect(guard.canActivate(ctxWith(`Basic ${jwt.sign({ sub: 'a1' })}`))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('token manipulado, de otro secreto o expirado denegado', async () => {
    const { guard } = setup({ user: { id: 'a1', role: UserRole.ADMIN, isActive: true } });
    const ajeno = new JwtService({ secret: 'otro' }).sign({ sub: 'a1' });
    await expect(guard.canActivate(ctxWith(`Bearer ${ajeno}`))).rejects.toBeInstanceOf(ForbiddenException);
    const expirado = jwt.sign({ sub: 'a1' }, { expiresIn: -10 });
    await expect(guard.canActivate(ctxWith(`Bearer ${expirado}`))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(ctxWith('Bearer basura'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('token sin sub denegado; usuario inexistente denegado', async () => {
    const a = setup({ user: { id: 'a1', role: UserRole.ADMIN, isActive: true } });
    await expect(a.guard.canActivate(ctxWith(bearer({ role: 'admin' })))).rejects.toBeInstanceOf(ForbiddenException);
    expect(a.usersService.findByIdOptional).not.toHaveBeenCalled();
    const b = setup({ user: null });
    await expect(b.guard.canActivate(ctxWith(bearer({ sub: 'fantasma', role: 'admin' })))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
