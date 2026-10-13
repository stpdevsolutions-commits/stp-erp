import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UserRole } from '../users/entities/user.entity';

/** AuthService con dependencias simuladas (sin BD ni red). JwtService real para probar de verdad la huella `pv`. */

const SECRET = 'test-secret-no-real';

function makeUser(over: Record<string, unknown> = {}) {
  return {
    id: 'u-1',
    email: 'ana@stp.do',
    password: bcrypt.hashSync('correcta', 4),
    firstName: 'Ana',
    lastName: 'Perez',
    role: UserRole.USER,
    isActive: true,
    ...over,
  };
}

function setup(env: Record<string, string | undefined> = {}) {
  const users: Record<string, ReturnType<typeof makeUser>> = {};
  const usersService = {
    findByEmail: jest.fn(async (e: string) => Object.values(users).find((u) => u.email === e) ?? null),
    findByIdOptional: jest.fn(async (id: string) => users[id] ?? null),
    create: jest.fn(async (email: string, _pw: string, firstName: string, lastName: string) => {
      const u = makeUser({ id: 'u-new', email, firstName, lastName });
      users[u.id] = u;
      return u;
    }),
    updatePassword: jest.fn(async (id: string, pw: string) => {
      users[id].password = bcrypt.hashSync(pw, 4);
    }),
  };
  const config = { get: jest.fn((k: string) => env[k]) };
  const notifications = { sendPasswordReset: jest.fn() };
  const saved: Array<Record<string, unknown>> = [];
  const refreshTokenRepo = {
    create: jest.fn((x: Record<string, unknown>) => ({ ...x, revoked: false })),
    save: jest.fn(async (x: Record<string, unknown>) => {
      saved.push(x);
      return x;
    }),
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const jwt = new JwtService({ secret: SECRET, signOptions: { expiresIn: '1h' } });
  const service = new AuthService(
    usersService as never,
    jwt,
    config as never,
    notifications as never,
    refreshTokenRepo as never,
  );
  const add = (u: ReturnType<typeof makeUser>) => {
    users[u.id] = u;
    return u;
  };
  return { service, usersService, notifications, refreshTokenRepo, jwt, add, users, saved };
}

describe('AuthService.login', () => {
  it('credenciales correctas: devuelve access y refresh token, sin la clave', async () => {
    const { service, add, saved } = setup();
    add(makeUser());
    const r = await service.login('ana@stp.do', 'correcta');
    expect(r.access_token).toEqual(expect.any(String));
    expect(r.refresh_token).toHaveLength(80);
    expect(r.user).toEqual({ id: 'u-1', email: 'ana@stp.do', firstName: 'Ana', lastName: 'Perez', role: UserRole.USER });
    expect(JSON.stringify(r)).not.toContain('password');
    // En BD solo se guarda el hash del refresh token, nunca el valor crudo.
    expect(saved[0].tokenHash).not.toBe(r.refresh_token);
    expect(saved[0].tokenHash).toHaveLength(64);
  });

  it('clave incorrecta -> Unauthorized', async () => {
    const { service, add } = setup();
    add(makeUser());
    await expect(service.login('ana@stp.do', 'otra')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('usuario inexistente -> Unauthorized con el mismo mensaje que clave incorrecta', async () => {
    const { service, add } = setup();
    add(makeUser());
    const wrong = await service.login('ana@stp.do', 'otra').catch((e: Error) => e.message);
    const missing = await service.login('nadie@stp.do', 'x').catch((e: Error) => e.message);
    expect(missing).toBe(wrong);
  });

  it('cuenta desactivada (con clave correcta) -> Unauthorized y no emite tokens', async () => {
    const { service, add, refreshTokenRepo } = setup();
    add(makeUser({ isActive: false }));
    await expect(service.login('ana@stp.do', 'correcta')).rejects.toThrow('Account disabled');
    expect(refreshTokenRepo.save).not.toHaveBeenCalled();
  });
});

describe('AuthService.loginWithGoogle', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  const mockFetch = (aud: string | undefined, info: Record<string, unknown> = {}) => {
    const fn = jest.fn(async (url: string) => {
      if (String(url).includes('tokeninfo')) return { ok: true, json: async () => ({ aud }) } as Response;
      return {
        ok: true,
        json: async () => ({ email: 'ana@stp.do', verified_email: true, given_name: 'Ana', family_name: 'P', ...info }),
      } as Response;
    });
    global.fetch = fn as never;
    return fn;
  };

  it('falla cerrado: sin audiencias configuradas rechaza y NO llama a Google', async () => {
    const { service } = setup({});
    const fn = mockFetch('cualquiera');
    await expect(service.loginWithGoogle('tok')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(fn).not.toHaveBeenCalled();
  });

  it('aud que no coincide -> rechaza antes de pedir el perfil', async () => {
    const { service, add } = setup({ GOOGLE_CLIENT_ID: 'web-id', GOOGLE_ANDROID_CLIENT_ID: 'and-id' });
    add(makeUser());
    const fn = mockFetch('otra-app');
    await expect(service.loginWithGoogle('tok')).rejects.toThrow('no emitido para esta aplicaci');
    expect(fn).toHaveBeenCalledTimes(1); // solo tokeninfo
  });

  it('tokeninfo sin aud -> rechaza', async () => {
    const { service } = setup({ GOOGLE_CLIENT_ID: 'web-id' });
    mockFetch(undefined);
    await expect(service.loginWithGoogle('tok')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each(['web-id', 'and-id'])('aud valido (%s) y usuario existente -> inicia sesion', async (aud) => {
    const { service, add } = setup({ GOOGLE_CLIENT_ID: 'web-id', GOOGLE_ANDROID_CLIENT_ID: 'and-id' });
    add(makeUser());
    mockFetch(aud);
    const r = await service.loginWithGoogle('tok');
    expect(r.user.email).toBe('ana@stp.do');
  });

  it('correo desconocido sin dominio/auto-provision permitido -> rechaza y no crea cuenta', async () => {
    const { service, usersService } = setup({ GOOGLE_CLIENT_ID: 'web-id' });
    mockFetch('web-id', { email: 'extra@otro.com' });
    await expect(service.loginWithGoogle('tok')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usersService.create).not.toHaveBeenCalled();
  });

  it('correo de Google no verificado -> rechaza', async () => {
    const { service, add } = setup({ GOOGLE_CLIENT_ID: 'web-id' });
    add(makeUser());
    mockFetch('web-id', { verified_email: false });
    await expect(service.loginWithGoogle('tok')).rejects.toThrow('no est');
  });

  it('auto-provision solo con dominio permitido Y GOOGLE_AUTO_PROVISION=true, con rol por defecto', async () => {
    const env = { GOOGLE_CLIENT_ID: 'web-id', GOOGLE_ALLOWED_DOMAINS: '@stp.do', GOOGLE_AUTO_PROVISION: 'true' };
    const ok = setup(env);
    mockFetch('web-id', { email: 'nuevo@stp.do' });
    await ok.service.loginWithGoogle('tok');
    expect(ok.usersService.create).toHaveBeenCalledTimes(1);
    expect((ok.usersService.create.mock.calls[0] as unknown[])[4]).toBeUndefined(); // sin opts de rol: USER por defecto

    const sinFlag = setup({ ...env, GOOGLE_AUTO_PROVISION: 'false' });
    mockFetch('web-id', { email: 'nuevo@stp.do' });
    await expect(sinFlag.service.loginWithGoogle('tok')).rejects.toBeInstanceOf(UnauthorizedException);

    const otroDominio = setup(env);
    mockFetch('web-id', { email: 'nuevo@evil.com' });
    await expect(otroDominio.service.loginWithGoogle('tok')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('usuario desactivado por Google -> rechaza', async () => {
    const { service, add } = setup({ GOOGLE_CLIENT_ID: 'web-id' });
    add(makeUser({ isActive: false }));
    mockFetch('web-id');
    await expect(service.loginWithGoogle('tok')).rejects.toThrow('Account disabled');
  });
});

describe('AuthService.forgotPassword / resetPassword', () => {
  const resetTokenFor = async (ctx: ReturnType<typeof setup>) => {
    await ctx.service.forgotPassword('ana@stp.do');
    const url = ctx.notifications.sendPasswordReset.mock.calls[0][0].resetUrl as string;
    return url.split('token=')[1];
  };

  it('forgotPassword emite un enlace con token tipo password-reset y huella pv', async () => {
    const ctx = setup();
    ctx.add(makeUser());
    const token = await resetTokenFor(ctx);
    const payload = ctx.jwt.verify(token);
    expect(payload).toMatchObject({ sub: 'u-1', type: 'password-reset' });
    expect(payload.pv).toHaveLength(16);
  });

  it('forgotPassword no revela si el correo existe ni envia a usuarios inactivos', async () => {
    const ctx = setup();
    ctx.add(makeUser({ isActive: false }));
    await expect(ctx.service.forgotPassword('ana@stp.do')).resolves.toBeUndefined();
    await expect(ctx.service.forgotPassword('nadie@stp.do')).resolves.toBeUndefined();
    expect(ctx.notifications.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('resetPassword valido cambia la clave', async () => {
    const ctx = setup();
    ctx.add(makeUser());
    const token = await resetTokenFor(ctx);
    await ctx.service.resetPassword(token, 'NuevaClave123');
    expect(ctx.usersService.updatePassword).toHaveBeenCalledWith('u-1', 'NuevaClave123');
  });

  it('un token ya usado falla: al cambiar la clave la huella pv cambia', async () => {
    const ctx = setup();
    ctx.add(makeUser());
    const token = await resetTokenFor(ctx);
    await ctx.service.resetPassword(token, 'NuevaClave123');
    await expect(ctx.service.resetPassword(token, 'OtraClave456')).rejects.toThrow('ya utilizado');
    expect(ctx.usersService.updatePassword).toHaveBeenCalledTimes(1);
  });

  it('rechaza token de otro tipo (p. ej. uno de decision de cotizacion o un access token)', async () => {
    const ctx = setup();
    ctx.add(makeUser());
    const other = ctx.jwt.sign({ sub: 'u-1', type: 'quote-decision', pv: 'x' });
    await expect(ctx.service.resetPassword(other, 'NuevaClave123')).rejects.toThrow('Token inv');
    const access = ctx.jwt.sign({ sub: 'u-1', email: 'ana@stp.do', role: 'user' });
    await expect(ctx.service.resetPassword(access, 'NuevaClave123')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(ctx.usersService.updatePassword).not.toHaveBeenCalled();
  });

  it('rechaza token de usuario inactivo (desactivado despues de pedir el enlace)', async () => {
    const ctx = setup();
    const u = ctx.add(makeUser());
    const token = await resetTokenFor(ctx);
    u.isActive = false;
    await expect(ctx.service.resetPassword(token, 'NuevaClave123')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(ctx.usersService.updatePassword).not.toHaveBeenCalled();
  });

  it('rechaza token sin huella pv (formato viejo) y token manipulado/ajeno', async () => {
    const ctx = setup();
    ctx.add(makeUser());
    const sinPv = ctx.jwt.sign({ sub: 'u-1', type: 'password-reset' });
    await expect(ctx.service.resetPassword(sinPv, 'NuevaClave123')).rejects.toBeInstanceOf(UnauthorizedException);
    const ajeno = new JwtService({ secret: 'otro-secreto' }).sign({ sub: 'u-1', type: 'password-reset', pv: 'x' });
    await expect(ctx.service.resetPassword(ajeno, 'NuevaClave123')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(ctx.service.resetPassword('basura', 'NuevaClave123')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza token expirado', async () => {
    const ctx = setup();
    ctx.add(makeUser());
    const expired = ctx.jwt.sign({ sub: 'u-1', type: 'password-reset', pv: 'x' }, { expiresIn: -10 });
    await expect(ctx.service.resetPassword(expired, 'NuevaClave123')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AuthService.refresh / logout', () => {
  const rawToken = 'a'.repeat(80);

  it('refresh valido rota: revoca el usado y emite un par nuevo', async () => {
    const ctx = setup();
    const user = makeUser();
    const rt = { revoked: false, expiresAt: new Date(Date.now() + 86_400_000), user };
    ctx.refreshTokenRepo.findOne.mockResolvedValue(rt);
    const r = await ctx.service.refresh(rawToken);
    expect(rt.revoked).toBe(true);
    expect(r.refresh_token).not.toBe(rawToken);
    // Busca solo tokens NO revocados, por hash.
    expect(ctx.refreshTokenRepo.findOne.mock.calls[0][0].where).toMatchObject({ revoked: false });
    expect(ctx.refreshTokenRepo.findOne.mock.calls[0][0].where.tokenHash).toHaveLength(64);
  });

  it('reutilizar un refresh token ya revocado (no aparece en la busqueda) -> Unauthorized sin emitir nada', async () => {
    const ctx = setup();
    ctx.refreshTokenRepo.findOne.mockResolvedValue(null);
    await expect(ctx.service.refresh(rawToken)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(ctx.refreshTokenRepo.save).not.toHaveBeenCalled();
  });

  it('refresh vencido -> se revoca y se rechaza', async () => {
    const ctx = setup();
    const rt = { revoked: false, expiresAt: new Date(Date.now() - 1000), user: makeUser() };
    ctx.refreshTokenRepo.findOne.mockResolvedValue(rt);
    await expect(ctx.service.refresh(rawToken)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(rt.revoked).toBe(true);
  });

  it('refresh de usuario desactivado -> Unauthorized', async () => {
    const ctx = setup();
    ctx.refreshTokenRepo.findOne.mockResolvedValue({
      revoked: false,
      expiresAt: new Date(Date.now() + 86_400_000),
      user: makeUser({ isActive: false }),
    });
    await expect(ctx.service.refresh(rawToken)).rejects.toThrow('Account disabled');
  });

  it('logout revoca por hash (nunca por el valor crudo)', async () => {
    const ctx = setup();
    await ctx.service.logout(rawToken);
    const [where, patch] = ctx.refreshTokenRepo.update.mock.calls[0];
    expect(where.tokenHash).toHaveLength(64);
    expect(where.tokenHash).not.toBe(rawToken);
    expect(patch).toEqual({ revoked: true });
  });
});
