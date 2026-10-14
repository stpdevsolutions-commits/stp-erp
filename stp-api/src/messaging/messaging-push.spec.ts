jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

import { MessagingService } from './messaging.service';
import { UserRole } from '../users/entities/user.entity';

// ERP-58: a quién se le manda el push cuando entra un mensaje de WhatsApp.
const u = (
  id: string,
  role: UserRole,
  email = `${id}@stp.com`,
  isActive = true,
) => ({ id, role, email, isActive });
const USERS = [
  u('admin', UserRole.ADMIN),
  u('manager', UserRole.MANAGER),
  u('finanza', UserRole.FINANZA),
  u('user', UserRole.USER),
  u('hermes', UserRole.ADMIN, 'hermes-agent@stp.com'),
  u('qa', UserRole.MANAGER, 'qa@pruebas.local'),
  u('baja', UserRole.ADMIN, 'baja@stp.com', false),
];

function build(opts: { enabled?: boolean; withPush?: boolean } = {}) {
  const { enabled = true, withPush = true } = opts;
  const push = { enabled, notifyUsers: jest.fn(async () => undefined) };
  const users = {
    // Imita el filtro del repositorio: id y/o isActive.
    find: jest.fn(
      async ({ where }: { where: { id?: string; isActive?: boolean } }) =>
        USERS.filter(
          (x) =>
            (where.id === undefined || x.id === where.id) &&
            (where.isActive === undefined || x.isActive === where.isActive),
        ),
    ),
  };
  const contacts = { update: jest.fn(async () => undefined) };
  const appNotifications = {
    notifyUser: jest.fn(async () => undefined),
    notifyRoles: jest.fn(async () => undefined),
  };
  const svc = new MessagingService(
    contacts as never,
    {} as never,
    users as never,
    {} as never,
    {} as never,
    { registerRaw: jest.fn() } as never,
    appNotifications as never,
    { get: () => undefined } as never,
    withPush ? (push as never) : undefined,
  );
  return { svc, push, users };
}

const alert = (
  svc: MessagingService,
  contact: Record<string, unknown>,
  isNew = false,
) =>
  (
    svc as unknown as { alertInbound: (...a: unknown[]) => Promise<void> }
  ).alertInbound(
    contact,
    'Ana',
    '18094208567',
    'Hola, necesito cotizar',
    isNew,
  );
const flush = () => new Promise((r) => setImmediate(r));

describe('push al entrar un mensaje de WhatsApp (ERP-58)', () => {
  it('sin responsable: a todos los que tienen la bandeja, sin finanza/user, cuentas de servicio ni inactivos', async () => {
    const { svc, push } = build();
    await alert(svc, { id: 'c1', assignedToId: null });
    await flush();
    expect(push.notifyUsers).toHaveBeenCalledTimes(1);
    const [ids, payload] = (push.notifyUsers.mock.calls as unknown[][])[0] as [
      string[],
      Record<string, string>,
    ];
    expect(ids.sort()).toEqual(['admin', 'manager']);
    expect(payload).toMatchObject({
      title: 'Mensaje de Ana',
      body: 'Hola, necesito cotizar',
      url: '/dashboard/mensajes?c=c1',
      tag: 'wa-c1',
    });
  });

  it('con responsable: solo a esa persona', async () => {
    const { svc, push } = build();
    await alert(svc, { id: 'c2', assignedToId: 'manager' });
    await flush();
    expect((push.notifyUsers.mock.calls as unknown[][])[0][0]).toEqual([
      'manager',
    ]);
  });

  it('si el responsable no tiene acceso a la bandeja o es cuenta de servicio, no se avisa a nadie', async () => {
    for (const assignedToId of ['finanza', 'user', 'hermes']) {
      const { svc, push } = build();
      await alert(svc, { id: 'c3', assignedToId });
      await flush();
      expect(
        (push.notifyUsers.mock.calls as unknown[][])[0]?.[0] ?? [],
      ).toEqual([]);
    }
  });

  it('el texto no incluye el teléfono; contacto nuevo cambia el título', async () => {
    const { svc, push } = build();
    await alert(svc, { id: 'c4', assignedToId: null }, true);
    await flush();
    const payload = (push.notifyUsers.mock.calls as unknown[][])[0][1] as {
      title: string;
      body: string;
    };
    expect(payload.title).toBe('Nuevo contacto: Ana');
    expect(JSON.stringify(payload)).not.toContain('18094208567');
  });

  it('push desactivado o no inyectado: no consulta usuarios y el aviso sigue su curso', async () => {
    const off = build({ enabled: false });
    await alert(off.svc, { id: 'c5', assignedToId: null });
    await flush();
    expect(off.users.find).not.toHaveBeenCalled();
    const none = build({ withPush: false });
    await expect(
      alert(none.svc, { id: 'c6', assignedToId: null }),
    ).resolves.toBeUndefined();
  });

  it('si el push falla, alertInbound no falla ni espera', async () => {
    const { svc, push } = build();
    push.notifyUsers.mockRejectedValue(new Error('boom'));
    await expect(
      alert(svc, { id: 'c7', assignedToId: null }),
    ).resolves.toBeUndefined();
    await flush();
  });
});
