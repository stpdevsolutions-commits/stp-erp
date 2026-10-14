import { isNewerThan, parseWebhook, previewOf, summarizeWebhook } from './whatsapp-parse';
import { isWorkingHours, MessagingService } from './messaging.service';
import { ConflictException } from '@nestjs/common';
import { WA_TEMPLATES } from './wa-templates';
import { normalizePhone } from '../notifications/whatsapp.service';
import { phoneNormalizedSql } from '../common/phone-normalized';

const wrap = (value: unknown) => ({ entry: [{ changes: [{ value }] }] });

describe('parseWebhook', () => {
  it('lee un texto con el nombre del perfil', () => {
    const { messages } = parseWebhook(
      wrap({
        contacts: [{ wa_id: '18094208567', profile: { name: 'Carlos' } }],
        messages: [{ id: 'wamid.1', from: '18094208567', timestamp: '1760000000', type: 'text', text: { body: 'Hola' } }],
      }),
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ waId: 'wamid.1', from: '18094208567', profileName: 'Carlos', type: 'text', body: 'Hola' });
    expect(messages[0].sentAt.getTime()).toBe(1760000000 * 1000);
  });

  it('convierte una ubicación en un enlace de mapa', () => {
    const { messages } = parseWebhook(
      wrap({ messages: [{ id: 'w2', from: '1809', type: 'location', location: { latitude: 18.45, longitude: -69.95 } }] }),
    );
    expect(messages[0].body).toContain('https://www.google.com/maps?q=18.45,-69.95');
  });

  it('guarda el adjunto de un documento', () => {
    const { messages } = parseWebhook(
      wrap({ messages: [{ id: 'w3', from: '1809', type: 'document', document: { id: 'm1', mime_type: 'application/pdf', filename: 'plano.pdf' } }] }),
    );
    expect(messages[0]).toMatchObject({ mediaId: 'm1', mime: 'application/pdf', filename: 'plano.pdf' });
  });

  it('toma el texto de un botón de respuesta rápida de una plantilla', () => {
    const { messages } = parseWebhook(wrap({ messages: [{ id: 'w4', from: '1809', type: 'button', button: { text: 'Confirmo' } }] }));
    expect(messages[0].body).toBe('Confirmo');
  });

  it('ignora las reacciones', () => {
    const { messages } = parseWebhook(wrap({ messages: [{ id: 'w5', from: '1809', type: 'reaction' }] }));
    expect(messages).toHaveLength(0);
  });

  it('lee los avisos de estado y su error', () => {
    const { statuses } = parseWebhook(
      wrap({
        statuses: [
          { id: 'a', status: 'delivered', timestamp: '1760000100' },
          { id: 'b', status: 'failed', timestamp: '1760000200', errors: [{ code: 131047, message: 'Re-engagement message' }] },
        ],
      }),
    );
    expect(statuses.map((s) => s.status)).toEqual(['delivered', 'failed']);
    expect(statuses[1].error).toContain('131047');
  });

  it('un cuerpo inesperado no rompe nada', () => {
    expect(parseWebhook(null)).toEqual({ messages: [], statuses: [] });
    expect(parseWebhook({ entry: 'x' })).toEqual({ messages: [], statuses: [] });
  });
});

describe('previewOf', () => {
  it('recorta el texto largo y nombra los adjuntos sin texto', () => {
    expect(previewOf('text', 'a'.repeat(200))).toHaveLength(120);
    expect(previewOf('image')).toBe('Foto');
    expect(previewOf('audio')).toBe('Nota de voz');
  });
});

describe('isWorkingHours (hora de RD, UTC-4)', () => {
  // 2026-10-14 es miércoles.
  it('lunes a viernes de 8:00 a 18:00', () => {
    expect(isWorkingHours(new Date('2026-10-14T12:00:00Z'))).toBe(true); // 8:00 RD
    expect(isWorkingHours(new Date('2026-10-14T11:59:00Z'))).toBe(false); // 7:59 RD
    expect(isWorkingHours(new Date('2026-10-14T21:59:00Z'))).toBe(true); // 17:59 RD
    expect(isWorkingHours(new Date('2026-10-14T22:00:00Z'))).toBe(false); // 18:00 RD
  });

  it('sábado hasta las 13:00 y domingo cerrado', () => {
    expect(isWorkingHours(new Date('2026-10-17T16:59:00Z'))).toBe(true); // sáb 12:59 RD
    expect(isWorkingHours(new Date('2026-10-17T17:00:00Z'))).toBe(false); // sáb 13:00 RD
    expect(isWorkingHours(new Date('2026-10-18T15:00:00Z'))).toBe(false); // domingo
  });
});

describe('plantillas', () => {
  it('cada texto usa tantos datos como parámetros declara', () => {
    for (const t of WA_TEMPLATES) {
      const text = t.render(t.params.map((_, i) => `P${i + 1}`));
      for (let i = 1; i <= t.params.length; i++) expect(text).toContain(`P${i}`);
    }
  });
});

describe('summarizeWebhook', () => {
  it('cuenta mensajes y estados sin exponer textos ni teléfonos', () => {
    const out = summarizeWebhook(
      wrap({
        messages: [{ id: 'w1', from: '18094208567', type: 'text', text: { body: 'Mi cédula es 001-0000000-1' } }, { id: 'w2', from: '18094208567', type: 'image' }],
        statuses: [{ id: 'a', status: 'delivered', recipient_id: '18094208567' }],
      }),
    );
    expect(out).toBe('mensajes=2 [text,image] estados=1 [delivered]');
    expect(out).not.toContain('8094208567');
    expect(out).not.toContain('cédula');
  });

  it('un tipo con texto libre se muestra como ?', () => {
    expect(summarizeWebhook(wrap({ messages: [{ type: 'Hola 809 555 1234' }] }))).toBe('mensajes=1 [?] estados=0');
  });

  it('cuerpos raros no rompen', () => {
    expect(summarizeWebhook(null)).toBe('mensajes=0 estados=0');
    expect(summarizeWebhook({ entry: [null, { changes: 'x' }, { changes: [null] }] })).toBe('mensajes=0 estados=0');
  });
});

describe('isNewerThan', () => {
  it('un mensaje más viejo no hace retroceder la última actividad', () => {
    const last = new Date('2026-10-13T12:00:00Z');
    expect(isNewerThan(last, new Date('2026-10-13T11:59:59Z'))).toBe(false);
    expect(isNewerThan(last, new Date('2026-10-13T12:00:00Z'))).toBe(false);
    expect(isNewerThan(last, new Date('2026-10-13T12:00:01Z'))).toBe(true);
    expect(isNewerThan(null, last)).toBe(true);
  });
});

describe('envío saliente', () => {
  const contact = { id: 'c1', phone: '18094208567', lastInboundAt: new Date(), assignedToId: 'u1', stage: 'qualifying' };
  const build = (sendTextTracked: jest.Mock) => {
    const saved: Record<string, unknown>[] = [];
    const messages = {
      create: (x: Record<string, unknown>) => x,
      save: jest.fn(async (x: Record<string, unknown>) => {
        const row = { id: `m${saved.length + 1}`, sentAt: new Date(), ...x };
        saved.push(row);
        return row;
      }),
      update: jest.fn(async () => undefined),
      findOne: jest.fn(async () => ({ id: 'm1', status: 'sent' })),
    };
    const qb: Record<string, jest.Mock> = {};
    for (const k of ['update', 'set', 'where', 'setParameters']) qb[k] = jest.fn(() => qb);
    qb.execute = jest.fn(async () => undefined);
    const contacts = { findOne: jest.fn(async () => contact), update: jest.fn(async () => undefined), createQueryBuilder: jest.fn(() => qb) };
    const svc = new MessagingService(
      contacts as never,
      messages as never,
      {} as never,
      {} as never,
      { sendTextTracked } as never,
      { registerRaw: jest.fn() } as never,
      {} as never,
      { get: () => undefined } as never,
    );
    return { svc, messages, saved, qb };
  };

  it('guarda el mensaje como "sending" antes de enviarlo a Meta', async () => {
    let statusAtSend: unknown;
    const send = jest.fn();
    const { svc, messages, saved } = build(send);
    send.mockImplementation(async () => {
      statusAtSend = saved[0]?.status;
      return { wamid: 'wamid.X' };
    });
    await svc.sendText('u1', 'c1', 'Hola');
    expect(statusAtSend).toBe('sending');
    expect(messages.update).toHaveBeenCalledWith('m1', { waId: 'wamid.X', status: 'sent' });
  });

  it('lastMessageAt del envío usa GREATEST para no retroceder', async () => {
    const { svc, qb } = build(jest.fn(async () => ({ wamid: 'w1' })));
    await svc.sendText('u1', 'c1', 'Hola');
    const set = qb.set.mock.calls[0][0] as { lastMessageAt: () => string };
    expect(set.lastMessageAt()).toBe('GREATEST("lastMessageAt", :sentAt)');
    expect(qb.setParameters).toHaveBeenCalledWith({ sentAt: expect.any(Date) });
  });

  it('si Meta rechaza, el mensaje queda como fallido', async () => {
    const { svc, messages } = build(jest.fn(async () => { throw new Error('boom'); }));
    await expect(svc.sendText('u1', 'c1', 'Hola')).rejects.toThrow('boom');
    expect(messages.update).toHaveBeenCalledWith('m1', { status: 'failed', error: 'boom' });
  });

  it('rechaza el mismo texto del mismo usuario repetido de inmediato, pero permite reintentar tras un fallo', async () => {
    const ok = build(jest.fn(async () => ({ wamid: 'w1' })));
    await ok.svc.sendText('u1', 'c1', 'Hola');
    await expect(ok.svc.sendText('u1', 'c1', 'Hola')).rejects.toBeInstanceOf(ConflictException);
    await expect(ok.svc.sendText('u2', 'c1', 'Hola')).resolves.toBeDefined();

    const bad = build(jest.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue({ wamid: 'w2' }));
    await expect(bad.svc.sendText('u1', 'c1', 'Hola')).rejects.toThrow();
    await expect(bad.svc.sendText('u1', 'c1', 'Hola')).resolves.toBeDefined();
  });
});

describe('teléfono normalizado (ERP-75)', () => {
  it('unifica formatos de RD con y sin código de país', () => {
    for (const raw of ['809-420-8567', '(809) 420 8567', '8094208567', '+1 809 420 8567', '18094208567', '1-809-420-8567']) {
      expect(normalizePhone(raw)).toBe('18094208567');
    }
  });

  it('rechaza lo que no parece un número', () => {
    for (const raw of ['', 'abc', '12345', '1234567890123456']) expect(normalizePhone(raw)).toBeNull();
  });

  it('la expresión SQL sigue la misma regla (10 dígitos => 1 + dígitos; 11 a 15; si no, NULL)', () => {
    const sql = phoneNormalizedSql('phone');
    expect(sql).toContain("regexp_replace(\"phone\", '\\D', '', 'g')");
    expect(sql).toContain("= 10 THEN '1' ||");
    expect(sql).toContain('BETWEEN 11 AND 15');
    expect(sql).toContain('ELSE NULL END');
  });

  const svcWith = (users: unknown, clients: unknown) =>
    new MessagingService({} as never, {} as never, users as never, clients as never, {} as never, { registerRaw: jest.fn() } as never, {} as never, { get: () => undefined } as never);

  it('isStaff consulta por la columna normalizada e ignora entradas inválidas', async () => {
    const where = jest.fn();
    const qb = { where: (...a: unknown[]) => (where(...a), qb), getExists: jest.fn(async () => true) };
    const svc = svcWith({ createQueryBuilder: () => qb }, {});
    await expect(svc.isStaff('809-420-8567')).resolves.toBe(true);
    expect(where).toHaveBeenCalledWith(expect.stringContaining('u.phoneNormalized = :p'), { p: '18094208567' });
    await expect(svc.isStaff('xx')).resolves.toBe(false);
    expect(qb.getExists).toHaveBeenCalledTimes(1);
  });

  it('findClientId busca por teléfono o teléfono de contacto y devuelve null si no hay', async () => {
    const where = jest.fn();
    const getRawOne = jest.fn().mockResolvedValueOnce({ id: 'cli1' }).mockResolvedValueOnce(undefined);
    const qb: Record<string, unknown> = {};
    for (const k of ['select', 'orderBy', 'limit']) qb[k] = () => qb;
    qb.where = (...a: unknown[]) => (where(...a), qb);
    qb.getRawOne = getRawOne;
    const svc = svcWith({}, { createQueryBuilder: () => qb });
    await expect(svc.findClientId('8094208567')).resolves.toBe('cli1');
    expect(where).toHaveBeenCalledWith('c.phoneNormalized = :p OR c.contactPhoneNormalized = :p', { p: '18094208567' });
    await expect(svc.findClientId('18094208567')).resolves.toBeNull();
    await expect(svc.findClientId('')).resolves.toBeNull();
  });
});
