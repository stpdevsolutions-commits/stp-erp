jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

import * as webpush from 'web-push';
import {
  isAllowedPushEndpoint,
  MAX_SUBSCRIPTIONS_PER_USER,
  PushService,
} from './push.service';

const sendNotification = webpush.sendNotification as unknown as jest.Mock;
const setVapidDetails = webpush.setVapidDetails as unknown as jest.Mock;

const cfg = (env: Record<string, string | undefined>) => ({
  get: (k: string) => env[k],
});
const KEYS = {
  VAPID_PUBLIC_KEY: 'pub',
  VAPID_PRIVATE_KEY: 'priv',
  VAPID_SUBJECT: 'mailto:a@b.co',
};

const row = (id: string, userId = 'u1') => ({
  id,
  userId,
  endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
  p256dh: 'p',
  auth: 'a',
});

function build(
  env: Record<string, string | undefined> = KEYS,
  rows: unknown[] = [],
) {
  const repo = {
    find: jest.fn(async () => rows),
    upsert: jest.fn(async () => undefined),
    delete: jest.fn(async () => undefined),
    update: jest.fn(async () => undefined),
  };
  return { svc: new PushService(repo as never, cfg(env) as never), repo };
}

beforeEach(() => {
  sendNotification.mockReset();
  setVapidDetails.mockReset();
});

describe('PushService — configuración', () => {
  it('con las tres variables queda activo y expone la clave pública', () => {
    const { svc } = build();
    expect(svc.enabled).toBe(true);
    expect(svc.getPublicKey()).toBe('pub');
    expect(setVapidDetails).toHaveBeenCalledWith(
      'mailto:a@b.co',
      'pub',
      'priv',
    );
  });

  it('sin claves queda desactivado: notifyUsers no hace nada ni toca la base', async () => {
    const { svc, repo } = build({});
    expect(svc.enabled).toBe(false);
    expect(svc.getPublicKey()).toBeNull();
    await svc.notifyUsers(['u1'], { title: 'x' });
    expect(repo.find).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('claves inválidas desactivan el módulo sin lanzar', () => {
    setVapidDetails.mockImplementation(() => {
      throw new Error('Vapid public key must be URL safe Base64');
    });
    const { svc } = build();
    expect(svc.enabled).toBe(false);
  });
});

describe('PushService.notifyUsers', () => {
  it('envía a cada dispositivo con carga recortada y actualiza lastUsedAt', async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    const { svc, repo } = build(KEYS, [row('s1'), row('s2')]);
    await svc.notifyUsers(['u1', 'u1'], {
      title: 'T'.repeat(200),
      body: 'B'.repeat(500),
      url: '/dashboard/mensajes?c=1',
      tag: 'wa-1',
    });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    const [target, body] = sendNotification.mock.calls[0];
    expect(target).toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/s1',
      keys: { p256dh: 'p', auth: 'a' },
    });
    const parsed = JSON.parse(body);
    expect(parsed.title.length).toBeLessThanOrEqual(80);
    expect(parsed.body.length).toBeLessThanOrEqual(140);
    expect(parsed).toMatchObject({
      url: '/dashboard/mensajes?c=1',
      tag: 'wa-1',
    });
    expect(repo.update).toHaveBeenCalled();
  });

  it('una URL externa o con // se sustituye por la bandeja', async () => {
    sendNotification.mockResolvedValue({});
    const { svc } = build(KEYS, [row('s1')]);
    await svc.notifyUsers(['u1'], { title: 'x', url: 'https://evil.example' });
    await svc.notifyUsers(['u1'], { title: 'x', url: '//evil.example' });
    for (const call of sendNotification.mock.calls)
      expect(JSON.parse(call[1]).url).toBe('/dashboard/mensajes');
  });

  it('404 o 410 eliminan la suscripción caducada; otros errores no', async () => {
    sendNotification
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockRejectedValueOnce({ statusCode: 500 })
      .mockResolvedValueOnce({});
    const { svc, repo } = build(KEYS, [row('s1'), row('s2'), row('s3')]);
    await svc.notifyUsers(['u1'], { title: 'x' });
    expect(repo.delete).toHaveBeenCalledTimes(1);
    expect(repo.delete).toHaveBeenCalledWith(['s1']);
  });

  it('nunca propaga errores (fallo de base o de red)', async () => {
    const { svc, repo } = build(KEYS, [row('s1')]);
    repo.find.mockRejectedValueOnce(new Error('db caída'));
    await expect(
      svc.notifyUsers(['u1'], { title: 'x' }),
    ).resolves.toBeUndefined();
    sendNotification.mockRejectedValue(new Error('ECONNRESET'));
    await expect(
      svc.notifyUsers(['u1'], { title: 'x' }),
    ).resolves.toBeUndefined();
  });

  it('sin destinatarios no consulta nada', async () => {
    const { svc, repo } = build();
    await svc.notifyUsers([], { title: 'x' });
    expect(repo.find).not.toHaveBeenCalled();
  });
});

describe('PushService.subscribe / unsubscribe', () => {
  it('hace upsert por endpoint (reasigna el dispositivo al usuario actual)', async () => {
    const { svc, repo } = build(KEYS, []);
    await svc.subscribe(
      'u1',
      { endpoint: 'https://fcm.googleapis.com/x', p256dh: 'p', auth: 'a' },
      'UA'.repeat(400),
    );
    expect(repo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        endpoint: 'https://fcm.googleapis.com/x',
      }),
      ['endpoint'],
    );
    const saved = (
      repo.upsert.mock.calls[0] as unknown as [{ userAgent: string }]
    )[0];
    expect(saved.userAgent.length).toBeLessThanOrEqual(300);
  });

  it('respeta el tope por usuario descartando las más viejas', async () => {
    const many = Array.from(
      { length: MAX_SUBSCRIPTIONS_PER_USER + 3 },
      (_, i) => row(`s${i}`),
    );
    const { svc, repo } = build(KEYS, many);
    await svc.subscribe('u1', {
      endpoint: 'https://fcm.googleapis.com/x',
      p256dh: 'p',
      auth: 'a',
    });
    expect(repo.delete).toHaveBeenCalledWith(['s10', 's11', 's12']);
  });

  it('unsubscribe solo borra la suscripción del propio usuario', async () => {
    const { svc, repo } = build();
    await svc.unsubscribe('u1', 'https://fcm.googleapis.com/x');
    expect(repo.delete).toHaveBeenCalledWith({
      userId: 'u1',
      endpoint: 'https://fcm.googleapis.com/x',
    });
  });
});

describe('isAllowedPushEndpoint', () => {
  it('acepta los servicios de push de los navegadores', () => {
    for (const u of [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://web.push.apple.com/QAbc',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://wns2-par02p.notify.windows.com/w/?token=abc',
    ])
      expect(isAllowedPushEndpoint(u)).toBe(true);
  });

  it('rechaza hosts arbitrarios, http, puertos y credenciales', () => {
    for (const u of [
      'http://fcm.googleapis.com/x',
      'https://evil.example/x',
      'https://fcm.googleapis.com.evil.example/x',
      'https://localhost/x',
      'https://169.254.169.254/x',
      'https://fcm.googleapis.com:8443/x',
      'https://user@fcm.googleapis.com/x',
      'no es url',
    ])
      expect(isAllowedPushEndpoint(u)).toBe(false);
  });
});
