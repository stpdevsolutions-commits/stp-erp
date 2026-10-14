jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModulePermissionGuard } from '../common/access/module-permission.guard';
import { REQUIRE_MODULE_KEY } from '../common/decorators/require-module.decorator';
import { UserRole } from '../users/entities/user.entity';
import { SubscribeDto } from './dto/push.dto';
import { PushController } from './push.controller';

const GOOD = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  keys: { p256dh: 'p'.repeat(20), auth: 'a'.repeat(12) },
};

function build(enabled = true) {
  const service = {
    enabled,
    getPublicKey: jest.fn(() => (enabled ? 'PUBKEY' : null)),
    subscribe: jest.fn(async () => undefined),
    unsubscribe: jest.fn(async () => undefined),
  };
  return { ctrl: new PushController(service as never), service };
}

describe('PushController', () => {
  it('exige sesión y el módulo mensajes', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PushController)).toEqual([
      JwtAuthGuard,
      ModulePermissionGuard,
    ]);
    expect(Reflect.getMetadata(REQUIRE_MODULE_KEY, PushController)).toEqual({
      module: 'mensajes',
      level: 'view',
    });
  });

  it('el guard de módulos deja pasar a admin/manager y bloquea a user, finanza y readonly', () => {
    const guard = new ModulePermissionGuard(new Reflector());
    const ctx = (role: UserRole) =>
      ({
        getHandler: () => PushController.prototype.subscribe,
        getClass: () => PushController,
        switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
      }) as never;
    expect(guard.canActivate(ctx(UserRole.ADMIN))).toBe(true);
    expect(guard.canActivate(ctx(UserRole.MANAGER))).toBe(true);
    for (const r of [UserRole.USER, UserRole.FINANZA, UserRole.READONLY])
      expect(guard.canActivate(ctx(r))).toBe(false);
  });

  it('public-key: devuelve la clave o 404 si no hay claves configuradas', () => {
    expect(build(true).ctrl.publicKey()).toEqual({ publicKey: 'PUBKEY' });
    expect(() => build(false).ctrl.publicKey()).toThrow(NotFoundException);
  });

  it('subscribe: registra para el usuario autenticado', async () => {
    const { ctrl, service } = build();
    await ctrl.subscribe(GOOD, { id: 'u1' }, 'Mozilla/5.0');
    expect(service.subscribe).toHaveBeenCalledWith(
      'u1',
      {
        endpoint: GOOD.endpoint,
        p256dh: GOOD.keys.p256dh,
        auth: GOOD.keys.auth,
      },
      'Mozilla/5.0',
    );
  });

  it('subscribe: 404 si el módulo está desactivado y 400 si el endpoint no es de un servicio de push', async () => {
    await expect(
      build(false).ctrl.subscribe(GOOD as never, { id: 'u1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    const { ctrl, service } = build();
    await expect(
      ctrl.subscribe(
        { ...GOOD, endpoint: 'https://evil.example/x' },
        {
          id: 'u1',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.subscribe).not.toHaveBeenCalled();
  });

  it('unsubscribe: solo actúa sobre el usuario autenticado', async () => {
    const { ctrl, service } = build();
    await ctrl.unsubscribe({ endpoint: GOOD.endpoint }, { id: 'u7' });
    expect(service.unsubscribe).toHaveBeenCalledWith('u7', GOOD.endpoint);
  });
});

describe('SubscribeDto', () => {
  it('acepta la forma de PushSubscription.toJSON() y rechaza http, claves cortas o vacías', async () => {
    expect(await validate(plainToInstance(SubscribeDto, GOOD))).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(SubscribeDto, {
          ...GOOD,
          endpoint: 'http://fcm.googleapis.com/x',
        }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(SubscribeDto, {
          ...GOOD,
          keys: { p256dh: 'x', auth: 'y' },
        }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(SubscribeDto, { endpoint: GOOD.endpoint }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(SubscribeDto, {
          ...GOOD,
          endpoint: `https://fcm.googleapis.com/${'a'.repeat(2100)}`,
        }),
      ),
    ).not.toHaveLength(0);
  });
});
