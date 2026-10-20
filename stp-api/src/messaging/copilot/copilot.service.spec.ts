import { ConflictException } from '@nestjs/common';
import { CopilotService } from './copilot.service';
import { CopilotUnavailableError } from './copilot-engine';
import { DISCLOSURE } from './copilot-rules';

type Row = Record<string, any>;

/** Repositorio en memoria con lo justo de TypeORM que usa el servicio. */
function fakeRepo(rows: Row[], opts: { exists?: () => boolean } = {}) {
  const match = (r: Row, where: Row) => Object.entries(where).every(([k, v]) => r[k] === v);
  const repo: any = {
    rows,
    create: (x: Row) => ({ id: `id${rows.length + 1}-${Math.random()}`, createdAt: new Date(), ...x }),
    save: async (x: Row) => {
      rows.push(x);
      return x;
    },
    findOne: async ({ where, order }: { where: Row; order?: Row }) => {
      let r = rows.filter((x) => match(x, where));
      if (order) {
        const [k, dir] = Object.entries(order)[0] as [string, string];
        r = r.sort((a, b) => (dir === 'DESC' ? +b[k] - +a[k] : +a[k] - +b[k]));
      }
      return r[0] ?? null;
    },
    find: async ({ where, order, take }: { where: Row; order?: Row; take?: number }) => {
      let r = rows.filter((x) => match(x, where));
      if (order) {
        const [k, dir] = Object.entries(order)[0] as [string, string];
        r = r.sort((a, b) => (dir === 'DESC' ? +b[k] - +a[k] : +a[k] - +b[k]));
      }
      return r.slice(0, take ?? r.length);
    },
    update: async (cond: string | Row, patch: Row) => {
      const where = typeof cond === 'string' ? { id: cond } : cond;
      const hit = rows.filter((x) => match(x, where));
      hit.forEach((x) => Object.assign(x, patch));
      return { affected: hit.length };
    },
    createQueryBuilder: () => {
      const qb: any = {};
      qb.where = () => qb;
      qb.update = () => qb;
      qb.set = (p: Row) => ((qb._set = p), qb);
      qb.getExists = async () => opts.exists?.() ?? false;
      qb.execute = async () => {
        // Marca como superadas las pendientes/fallidas anteriores (id distinto del recién guardado).
        const newest = rows[rows.length - 1];
        rows.filter((x) => x !== newest && (x.status === 'pending' || x.status === 'failed')).forEach((x) => (x.status = 'superseded'));
      };
      return qb;
    },
  };
  return repo;
}

const T0 = Date.now() - 60_000;
const msg = (over: Row): Row => ({ id: `m${Math.random()}`, contactId: 'c1', direction: 'in', type: 'text', body: 'hola', sentAt: new Date(T0), ...over });

function setup(opts: { contact?: Row; messages?: Row[]; env?: Record<string, string>; disclosed?: boolean; analyze?: jest.Mock } = {}) {
  const contact = { id: 'c1', name: 'Carlos', clientId: null, lastInboundAt: new Date(), service: null, notes: null, ...opts.contact };
  const contacts = fakeRepo([contact]);
  const messages = fakeRepo(opts.messages ?? [msg({ body: 'Necesito un sistema de presión constante para mi edificio' })]);
  const suggestions = fakeRepo([], { exists: () => !!opts.disclosed });
  const messaging = { onInbound: jest.fn(), sendText: jest.fn(async () => ({ id: 'out1', sentAt: new Date(), status: 'sent' })) };
  const engine = {
    analyze:
      opts.analyze ??
      jest.fn(async () => ({
        raw: {
          category: 'nueva_consulta',
          summary: 'Edificio necesita presión constante',
          service: 'presion_constante',
          lead: { name: 'Carlos', location: null, details: 'Edificio' },
          missing: ['ubicación'],
          escalate: false,
          escalationReason: null,
          reply: 'Con gusto le ayudamos. ¿En qué sector y ciudad está el edificio?',
          confidence: 0.92,
        },
        provider: 'gemini',
        model: 'gemini-flash-latest',
      })),
  };
  const config = { get: (k: string) => ({ COPILOT_ENABLED: 'true', COPILOT_DEBOUNCE_SECONDS: '0', ...opts.env })[k] };
  const svc = new CopilotService(suggestions as never, contacts as never, messages as never, messaging as never, engine as never, config as never);
  return { svc, contact, contacts, messages, suggestions, messaging, engine };
}

describe('CopilotService.run', () => {
  it('crea una sugerencia pendiente con el aviso de asistente virtual', async () => {
    const { svc, suggestions, engine } = setup();
    const s = await svc.run('c1');
    expect(s?.status).toBe('pending');
    expect(s?.kind).toBe('responder');
    expect(s?.reply?.startsWith(DISCLOSURE)).toBe(true);
    expect(s?.provider).toBe('gemini');
    expect(suggestions.rows).toHaveLength(1);
    // R11: a la IA no le llega el teléfono
    expect(JSON.stringify((engine.analyze as jest.Mock).mock.calls[0][0])).not.toMatch(/phone|\d{10}/);
  });

  it('cliente existente: deriva sin respuesta', async () => {
    const { svc } = setup({ contact: { clientId: 'cli-1' } });
    const s = await svc.run('c1');
    expect(s?.kind).toBe('derivar');
    expect(s?.reply).toBeNull();
    expect(s?.escalate).toBe(true);
  });

  it('no propone nada si el equipo ya contestó', async () => {
    const { svc, suggestions } = setup({ messages: [msg({}), msg({ direction: 'out', sentById: 'u9', sentAt: new Date(T0 + 1000) })] });
    expect(await svc.run('c1')).toBeNull();
    expect(suggestions.rows).toHaveLength(0);
  });

  it('el acuse automático (sin usuario) no cuenta como respuesta: se propone igual', async () => {
    const { svc } = setup({ messages: [msg({ body: 'Quiero cámaras' }), msg({ direction: 'out', sentById: null, body: 'Gracias por escribir', sentAt: new Date(T0 + 500) })] });
    const s = await svc.run('c1');
    expect(s?.status).toBe('pending');
    expect((await svc.getForContact('c1'))?.id).toBe(s!.id);
  });

  it('no analiza dos veces el mismo mensaje', async () => {
    const { svc, suggestions } = setup();
    await svc.run('c1');
    expect(await svc.run('c1')).toBeNull();
    expect(suggestions.rows).toHaveLength(1);
  });

  it('si la IA falla, guarda una sugerencia fallida y no inventa respuesta (R12)', async () => {
    const analyze = jest.fn().mockRejectedValue(new CopilotUnavailableError('503 overloaded', true));
    const { svc } = setup({ analyze });
    const s = await svc.run('c1');
    expect(s?.status).toBe('failed');
    expect(s?.reply).toBeUndefined();
    const view = await svc.getForContact('c1');
    expect(view?.error).toMatch(/a mano/);
  });

  it('una sugerencia nueva deja superada a la anterior', async () => {
    const { svc, suggestions, messages } = setup();
    await svc.run('c1');
    messages.rows.push(msg({ body: 'Es en Santo Domingo Este', sentAt: new Date(T0 + 5000) }));
    await svc.run('c1');
    expect(suggestions.rows.map((r: Row) => r.status)).toEqual(['superseded', 'pending']);
  });

  it('aviso ya dado: no se repite', async () => {
    const { svc } = setup({ disclosed: true });
    const s = await svc.run('c1');
    expect(s?.reply?.startsWith(DISCLOSURE)).toBe(false);
  });
});

describe('CopilotService.schedule', () => {
  it('apagado por defecto: no programa nada', () => {
    const { svc } = setup({ env: { COPILOT_ENABLED: 'false' } });
    const spy = jest.spyOn(svc, 'run');
    svc.schedule('c1');
    expect(spy).not.toHaveBeenCalled();
    expect((svc as any).timers.size).toBe(0);
  });

  it('juntar mensajes seguidos: un solo análisis', async () => {
    jest.useFakeTimers();
    try {
      const { svc } = setup({ env: { COPILOT_DEBOUNCE_SECONDS: '20' } });
      const spy = jest.spyOn(svc, 'run').mockResolvedValue(null);
      svc.schedule('c1');
      jest.advanceTimersByTime(10_000);
      svc.schedule('c1');
      jest.advanceTimersByTime(19_000);
      expect(spy).not.toHaveBeenCalled();
      jest.advanceTimersByTime(2_000);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('se engancha a la bandeja al iniciar', () => {
    const { svc, messaging } = setup();
    svc.onModuleInit();
    expect(messaging.onInbound).toHaveBeenCalledTimes(1);
  });
});

describe('CopilotService: la persona decide', () => {
  it('enviar usa el texto propuesto por el camino normal y marca la sugerencia', async () => {
    const { svc, suggestions, messaging } = setup();
    const s = await svc.run('c1');
    const sent = await svc.send('u1', s!.id);
    expect(sent.id).toBe('out1');
    expect(messaging.sendText).toHaveBeenCalledWith('u1', 'c1', s!.reply);
    expect(suggestions.rows[0]).toMatchObject({ status: 'sent', resolvedById: 'u1', edited: false, sentMessageId: 'out1' });
  });

  it('enviar con texto editado lo marca como editado', async () => {
    const { svc, suggestions, messaging } = setup();
    const s = await svc.run('c1');
    await svc.send('u1', s!.id, 'Buenas, con gusto. ¿Dónde está ubicado el edificio?');
    expect(messaging.sendText).toHaveBeenCalledWith('u1', 'c1', 'Buenas, con gusto. ¿Dónde está ubicado el edificio?');
    expect(suggestions.rows[0].edited).toBe(true);
  });

  it('no se puede enviar dos veces', async () => {
    const { svc } = setup();
    const s = await svc.run('c1');
    await svc.send('u1', s!.id);
    await expect(svc.send('u2', s!.id)).rejects.toBeInstanceOf(ConflictException);
  });

  it('si el envío falla, la sugerencia sigue pendiente para reintentar', async () => {
    const { svc, suggestions, messaging } = setup();
    messaging.sendText.mockRejectedValueOnce(new Error('Meta rechazó'));
    const s = await svc.run('c1');
    await expect(svc.send('u1', s!.id)).rejects.toThrow('Meta rechazó');
    expect(suggestions.rows[0].status).toBe('pending');
    await svc.send('u1', s!.id);
    expect(suggestions.rows[0].status).toBe('sent');
  });

  it('si alguien ya contestó o llegó otro mensaje, la sugerencia queda vieja y no sale', async () => {
    const { svc, suggestions, messages, messaging } = setup();
    const s = await svc.run('c1');
    messages.rows.push(msg({ direction: 'out', sentById: 'u9', body: 'Ya le atendí yo', sentAt: new Date(T0 + 9000) }));
    await expect(svc.send('u1', s!.id)).rejects.toBeInstanceOf(ConflictException);
    expect(messaging.sendText).not.toHaveBeenCalled();
    expect(suggestions.rows[0].status).toBe('superseded');
    expect(await svc.getForContact('c1')).toBeNull();
  });

  it('una derivación sin texto no se envía vacía', async () => {
    const { svc } = setup({ contact: { clientId: 'cli-1' } });
    const s = await svc.run('c1');
    await expect(svc.send('u1', s!.id)).rejects.toThrow(/No hay texto/);
    await expect(svc.send('u1', s!.id, '   ')).rejects.toThrow(/No hay texto/);
  });

  it('descartar', async () => {
    const { svc, suggestions } = setup();
    const s = await svc.run('c1');
    await svc.discard('u1', s!.id);
    expect(suggestions.rows[0].status).toBe('discarded');
    expect(await svc.getForContact('c1')).toBeNull();
  });

  it('aplicar datos al lead completa servicio, nombre y notas sin pisar lo escrito, y solo una vez', async () => {
    const { svc, contact } = setup({ contact: { name: null, notes: 'Nota previa' } });
    const s = await svc.run('c1');
    const r = await svc.applyData('u1', s!.id);
    expect(r.service).toMatch(/Presión constante/);
    expect(contact.name).toBe('Carlos');
    expect(contact.notes).toMatch(/^Nota previa\n\[Asistente \d{4}-\d{2}-\d{2}\]/);
    await expect(svc.applyData('u1', s!.id)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('CopilotService.simulate', () => {
  it('devuelve el análisis filtrado por las reglas duras y no guarda nada', async () => {
    const analyze = jest.fn(async () => ({
      raw: { category: 'precio', summary: 's', service: 'presion_constante', escalate: true, reply: 'Son RD$ 50,000.', confidence: 0.9 },
      provider: 'gemini',
      model: 'm',
    }));
    const { svc, suggestions } = setup({ analyze });
    const r = await svc.simulate({ messages: [{ from: 'cliente', text: '¿Cuánto cuesta?' }] });
    expect(r.suggestion.reply).toBeNull();
    expect(r.suggestion.escalate).toBe(true);
    expect(suggestions.rows).toHaveLength(0);
  });
});
