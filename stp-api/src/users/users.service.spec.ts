import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { UserRole } from './entities/user.entity';

/** UsersService con repositorios simulados: ultimo admin activo y revocacion de sesiones. */

function makeUser(over: Record<string, unknown> = {}) {
  return {
    id: 'u-1',
    email: 'u@stp.do',
    password: 'hash-viejo',
    firstName: 'U',
    lastName: 'Uno',
    role: UserRole.USER,
    isActive: true,
    ...over,
  };
}

function setup(user: Record<string, unknown> | null, otherActiveAdmins = 0) {
  const usersRepository = {
    findOne: jest.fn().mockResolvedValue(user),
    count: jest.fn().mockResolvedValue(otherActiveAdmins),
    save: jest.fn(async (u: unknown) => u),
  };
  const refreshTokens = { update: jest.fn().mockResolvedValue({ affected: 2 }) };
  const service = new UsersService(refreshTokens as never, usersRepository as never);
  return { service, usersRepository, refreshTokens };
}

describe('UsersService - ultimo administrador activo', () => {
  const admin = () => makeUser({ id: 'a-1', role: UserRole.ADMIN });

  it('no se puede desactivar (remove) al unico admin activo', async () => {
    const { service, usersRepository } = setup(admin(), 0);
    await expect(service.remove('a-1', 'a-1')).rejects.toBeInstanceOf(ConflictException);
    expect(usersRepository.save).not.toHaveBeenCalled();
  });

  it('se puede desactivar a un admin si queda otro activo', async () => {
    const u = admin();
    const { service, usersRepository } = setup(u, 1);
    await service.remove('a-1', 'otro');
    expect(u.isActive).toBe(false);
    expect(usersRepository.save).toHaveBeenCalled();
  });

  it('la consulta excluye al propio admin y cuenta solo admins activos', async () => {
    const { service, usersRepository } = setup(admin(), 1);
    await service.remove('a-1');
    const where = usersRepository.count.mock.calls[0][0].where;
    expect(where.role).toBe(UserRole.ADMIN);
    expect(where.isActive).toBe(true);
    expect(where.id).toBeDefined(); // Not(id)
  });

  it('no se puede degradar al unico admin activo (update role)', async () => {
    const { service, usersRepository } = setup(admin(), 0);
    await expect(service.update('a-1', { role: UserRole.USER } as never, 'a-1', UserRole.ADMIN)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(usersRepository.save).not.toHaveBeenCalled();
  });

  it('no se puede desactivar al unico admin activo (update isActive=false)', async () => {
    const { service } = setup(admin(), 0);
    await expect(service.update('a-1', { isActive: false } as never, 'a-1', UserRole.ADMIN)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('degradar con otro admin activo disponible funciona y revoca sus sesiones', async () => {
    const { service, refreshTokens } = setup(admin(), 1);
    const saved = await service.update('a-1', { role: UserRole.MANAGER } as never, 'otro', UserRole.ADMIN);
    expect(saved.role).toBe(UserRole.MANAGER);
    expect(refreshTokens.update).toHaveBeenCalledWith({ userId: 'a-1', revoked: false }, { revoked: true });
  });

  it('el ultimo admin puede cambiar otros datos (nombre) o "re-asignarse" admin', async () => {
    const { service, usersRepository } = setup(admin(), 0);
    await service.update('a-1', { firstName: 'Nuevo', role: UserRole.ADMIN } as never, 'a-1', UserRole.ADMIN);
    expect(usersRepository.count).not.toHaveBeenCalled();
  });

  it('un usuario no-admin o un admin ya inactivo se puede desactivar sin consultar admins', async () => {
    const a = setup(makeUser(), 0);
    await a.service.remove('u-1');
    expect(a.usersRepository.count).not.toHaveBeenCalled();
    const b = setup(makeUser({ role: UserRole.ADMIN, isActive: false }), 0);
    await b.service.remove('u-1');
    expect(b.usersRepository.count).not.toHaveBeenCalled();
  });

  it('remove de un usuario inexistente -> NotFound', async () => {
    const { service } = setup(null);
    await expect(service.remove('x')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('UsersService - revocacion de sesiones', () => {
  it('updatePassword guarda la clave hasheada y revoca todos los refresh tokens', async () => {
    const u = makeUser();
    const { service, refreshTokens } = setup(u);
    await service.updatePassword('u-1', 'NuevaClave123');
    expect(u.password).not.toBe('NuevaClave123');
    expect(await bcrypt.compare('NuevaClave123', u.password)).toBe(true);
    expect(refreshTokens.update).toHaveBeenCalledWith({ userId: 'u-1', revoked: false }, { revoked: true });
  });

  it('update con password revoca los refresh tokens y guarda hash', async () => {
    const u = makeUser();
    const { service, refreshTokens } = setup(u);
    await service.update('u-1', { password: 'NuevaClave123' } as never, 'u-1', UserRole.USER);
    expect(await bcrypt.compare('NuevaClave123', u.password)).toBe(true);
    expect(refreshTokens.update).toHaveBeenCalledWith({ userId: 'u-1', revoked: false }, { revoked: true });
  });

  it('update de datos sin password/estado/rol NO revoca sesiones', async () => {
    const { service, refreshTokens } = setup(makeUser());
    await service.update('u-1', { firstName: 'Otro' } as never, 'u-1', UserRole.USER);
    expect(refreshTokens.update).not.toHaveBeenCalled();
  });

  it('desactivar o cambiar de rol revoca sesiones', async () => {
    const a = setup(makeUser());
    await a.service.update('u-1', { isActive: false } as never, 'adm', UserRole.ADMIN);
    expect(a.refreshTokens.update).toHaveBeenCalledTimes(1);
    const b = setup(makeUser());
    await b.service.update('u-1', { role: UserRole.MANAGER } as never, 'adm', UserRole.ADMIN);
    expect(b.refreshTokens.update).toHaveBeenCalledTimes(1);
  });
});

describe('UsersService.update - permisos del solicitante', () => {
  it('un usuario no puede editar a otro', async () => {
    const { service } = setup(makeUser());
    await expect(service.update('u-1', { firstName: 'X' } as never, 'otro', UserRole.USER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('un usuario no-admin no puede cambiarse rol ni estado (escalada de privilegios)', async () => {
    const { service, usersRepository } = setup(makeUser());
    await expect(service.update('u-1', { role: UserRole.ADMIN } as never, 'u-1', UserRole.USER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.update('u-1', { isActive: true } as never, 'u-1', UserRole.MANAGER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(usersRepository.save).not.toHaveBeenCalled();
  });

  it('un usuario puede cambiar su propia clave', async () => {
    const { service } = setup(makeUser());
    await expect(
      service.update('u-1', { password: 'NuevaClave123' } as never, 'u-1', UserRole.USER),
    ).resolves.toBeDefined();
  });
});

describe('UsersService.create', () => {
  it('normaliza el correo, hashea la clave y rechaza duplicados', async () => {
    const { service, usersRepository } = setup(null);
    (usersRepository as unknown as { create: jest.Mock }).create = jest.fn((x) => x);
    const u = await service.create('  ANA@STP.DO ', 'Clave12345', 'Ana', 'P');
    expect(u.email).toBe('ana@stp.do');
    expect(u.password).not.toBe('Clave12345');

    const dup = setup(makeUser({ email: 'ana@stp.do' }));
    await expect(dup.service.create('ana@stp.do', 'x', 'A', 'B')).rejects.toBeInstanceOf(ConflictException);
  });
});
