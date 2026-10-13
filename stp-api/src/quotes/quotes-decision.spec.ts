import { QuotesService } from './quotes.service';
import { QuoteStatus } from './entities/quote.entity';

/** Decision publica del cliente sobre una cotizacion (enlace del correo). Sin BD real: repositorio y JWT simulados. */

const QUOTE_ID = 'q-1';

function makeQuote(over: Record<string, unknown> = {}) {
  return {
    id: QUOTE_ID,
    number: 'COT-2026-001',
    title: 'Instalacion electrica',
    total: 1000,
    status: QuoteStatus.SENT,
    supersededById: null,
    createdById: 'u-1',
    client: { name: 'Cliente SA' },
    ...over,
  };
}

function setup(opts: { quote?: Record<string, unknown> | null; fresh?: Record<string, unknown> | null; affected?: number } = {}) {
  const quote = opts.quote === undefined ? makeQuote() : opts.quote;
  const execute = jest.fn().mockResolvedValue({ affected: opts.affected ?? 1 });
  const where = jest.fn().mockReturnValue({ execute });
  const set = jest.fn().mockReturnValue({ where });
  const update = jest.fn().mockReturnValue({ set });
  const createQueryBuilder = jest.fn().mockReturnValue({ update });
  const findOne = jest
    .fn()
    .mockResolvedValueOnce(quote)
    .mockResolvedValue(opts.fresh ?? null);
  const quotesRepository = { findOne, createQueryBuilder, save: jest.fn() };

  const jwtService = {
    verify: jest.fn((token: string) => {
      if (token === 'bad') throw new Error('invalid signature');
      if (token === 'wrong-type') return { sub: QUOTE_ID, type: 'password-reset' };
      if (token === 'no-sub') return { type: 'quote-decision' };
      return { sub: QUOTE_ID, type: 'quote-decision' };
    }),
  };
  const notifications = { sendQuoteApproved: jest.fn(), sendQuoteRejected: jest.fn() };
  const appNotifications = { notifyUser: jest.fn() };

  const service = new QuotesService(
    quotesRepository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    notifications as never,
    {} as never,
    jwtService as never,
    {} as never,
    {} as never,
    {} as never,
    appNotifications as never,
  );
  return { service, quotesRepository, notifications, appNotifications, update, set, where, execute, jwtService };
}

describe('QuotesService.previewDecision (GET del enlace)', () => {
  it('token invalido -> invalid', async () => {
    const { service, quotesRepository } = setup();
    expect(await service.previewDecision('bad', 'approve')).toEqual({ kind: 'invalid' });
    expect(quotesRepository.findOne).not.toHaveBeenCalled();
  });

  it('accion distinta de approve/reject -> invalid sin ni verificar el token', async () => {
    const { service, jwtService } = setup();
    expect(await service.previewDecision('ok', 'delete')).toEqual({ kind: 'invalid' });
    expect(await service.previewDecision('ok', '')).toEqual({ kind: 'invalid' });
    expect(jwtService.verify).not.toHaveBeenCalled();
  });

  it('token de otro tipo (p. ej. reset de clave) -> invalid', async () => {
    const { service } = setup();
    expect(await service.previewDecision('wrong-type', 'approve')).toEqual({ kind: 'invalid' });
  });

  it('token sin sub -> invalid', async () => {
    const { service } = setup();
    expect(await service.previewDecision('no-sub', 'approve')).toEqual({ kind: 'invalid' });
  });

  it('cotizacion inexistente -> invalid', async () => {
    const { service } = setup({ quote: null });
    expect(await service.previewDecision('ok', 'approve')).toEqual({ kind: 'invalid' });
  });

  it.each([QuoteStatus.APPROVED, QuoteStatus.REJECTED])('ya decidida (%s) -> already con ese estado', async (status) => {
    const { service } = setup({ quote: makeQuote({ status }) });
    expect(await service.previewDecision('ok', 'approve')).toEqual({ kind: 'already', status, quoteNumber: 'COT-2026-001' });
  });

  it('reemplazada por una revision (supersededById) -> not-sent', async () => {
    const { service } = setup({ quote: makeQuote({ supersededById: 'q-2' }) });
    expect(await service.previewDecision('ok', 'approve')).toEqual({ kind: 'not-sent', quoteNumber: 'COT-2026-001' });
  });

  it.each([QuoteStatus.DRAFT, QuoteStatus.EXPIRED])('no enviada (%s) -> not-sent', async (status) => {
    const { service } = setup({ quote: makeQuote({ status }) });
    expect(await service.previewDecision('ok', 'reject')).toEqual({ kind: 'not-sent', quoteNumber: 'COT-2026-001' });
  });

  it('cotizacion enviada -> confirm, y NO escribe nada ni notifica', async () => {
    const { service, quotesRepository, notifications, appNotifications } = setup();
    const r = await service.previewDecision('ok', 'reject');
    expect(r).toEqual({ kind: 'confirm', action: 'reject', quoteNumber: 'COT-2026-001', token: 'ok' });
    expect(quotesRepository.createQueryBuilder).not.toHaveBeenCalled();
    expect(quotesRepository.save).not.toHaveBeenCalled();
    expect(notifications.sendQuoteApproved).not.toHaveBeenCalled();
    expect(notifications.sendQuoteRejected).not.toHaveBeenCalled();
    expect(appNotifications.notifyUser).not.toHaveBeenCalled();
  });
});

describe('QuotesService.decide (POST de confirmacion)', () => {
  it('token invalido / tipo equivocado / accion invalida -> invalid sin escribir', async () => {
    const { service, quotesRepository } = setup();
    expect(await service.decide('bad', 'approve')).toEqual({ kind: 'invalid' });
    expect(await service.decide('wrong-type', 'approve')).toEqual({ kind: 'invalid' });
    expect(await service.decide('ok', 'maybe')).toEqual({ kind: 'invalid' });
    expect(quotesRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('cotizacion inexistente -> invalid', async () => {
    const { service, quotesRepository } = setup({ quote: null });
    expect(await service.decide('ok', 'approve')).toEqual({ kind: 'invalid' });
    expect(quotesRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('ya decidida -> already, sin UPDATE ni notificacion', async () => {
    const { service, quotesRepository, notifications } = setup({ quote: makeQuote({ status: QuoteStatus.APPROVED }) });
    expect(await service.decide('ok', 'reject')).toEqual({
      kind: 'already',
      status: QuoteStatus.APPROVED,
      quoteNumber: 'COT-2026-001',
    });
    expect(quotesRepository.createQueryBuilder).not.toHaveBeenCalled();
    expect(notifications.sendQuoteRejected).not.toHaveBeenCalled();
  });

  it('reemplazada o no enviada -> not-sent, sin UPDATE', async () => {
    const a = setup({ quote: makeQuote({ supersededById: 'q-2' }) });
    expect(await a.service.decide('ok', 'approve')).toEqual({ kind: 'not-sent', quoteNumber: 'COT-2026-001' });
    const b = setup({ quote: makeQuote({ status: QuoteStatus.DRAFT }) });
    expect(await b.service.decide('ok', 'approve')).toEqual({ kind: 'not-sent', quoteNumber: 'COT-2026-001' });
    expect(a.quotesRepository.createQueryBuilder).not.toHaveBeenCalled();
    expect(b.quotesRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('aprobar: UPDATE condicional (status = sent), guarda IP/UA, notifica UNA vez', async () => {
    const { service, set, where, notifications, appNotifications } = setup();
    const r = await service.decide('ok', 'approve', { ip: '1.2.3.4', userAgent: 'jest' });
    expect(r).toEqual({ kind: 'success', status: QuoteStatus.APPROVED, quoteNumber: 'COT-2026-001' });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ status: QuoteStatus.APPROVED, decisionIp: '1.2.3.4', decisionUserAgent: 'jest' }),
    );
    expect(where).toHaveBeenCalledWith(
      expect.stringContaining('status = :sent'),
      expect.objectContaining({ id: QUOTE_ID, sent: QuoteStatus.SENT }),
    );
    expect(notifications.sendQuoteApproved).toHaveBeenCalledTimes(1);
    expect(notifications.sendQuoteApproved).toHaveBeenCalledWith(
      expect.objectContaining({ quoteNumber: 'COT-2026-001', clientName: 'Cliente SA', total: 1000 }),
    );
    expect(notifications.sendQuoteRejected).not.toHaveBeenCalled();
    expect(appNotifications.notifyUser).toHaveBeenCalledTimes(1);
  });

  it('rechazar: notifica rechazo UNA vez y no aprobacion', async () => {
    const { service, set, notifications } = setup();
    const r = await service.decide('ok', 'reject');
    expect(r).toEqual({ kind: 'success', status: QuoteStatus.REJECTED, quoteNumber: 'COT-2026-001' });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: QuoteStatus.REJECTED }));
    expect(notifications.sendQuoteRejected).toHaveBeenCalledTimes(1);
    expect(notifications.sendQuoteApproved).not.toHaveBeenCalled();
  });

  it('recorta IP (64) y user-agent (512) y no los guarda si no vienen', async () => {
    const a = setup();
    await a.service.decide('ok', 'approve', { ip: 'x'.repeat(100), userAgent: 'u'.repeat(900) });
    const setArg = a.set.mock.calls[0][0];
    expect(setArg.decisionIp).toHaveLength(64);
    expect(setArg.decisionUserAgent).toHaveLength(512);

    const b = setup();
    await b.service.decide('ok', 'approve');
    expect(b.set.mock.calls[0][0]).not.toHaveProperty('decisionIp');
    expect(b.set.mock.calls[0][0]).not.toHaveProperty('decisionUserAgent');
  });

  it('carrera: UPDATE con affected 0 y otra peticion ya decidio -> already, SIN notificar', async () => {
    const { service, notifications, appNotifications } = setup({
      affected: 0,
      fresh: makeQuote({ status: QuoteStatus.REJECTED }),
    });
    const r = await service.decide('ok', 'approve');
    expect(r).toEqual({ kind: 'already', status: QuoteStatus.REJECTED, quoteNumber: 'COT-2026-001' });
    expect(notifications.sendQuoteApproved).not.toHaveBeenCalled();
    expect(notifications.sendQuoteRejected).not.toHaveBeenCalled();
    expect(appNotifications.notifyUser).not.toHaveBeenCalled();
  });

  it('carrera: affected 0 y la cotizacion ya no esta en sent (p. ej. reemplazada) -> not-sent sin notificar', async () => {
    const { service, notifications } = setup({ affected: 0, fresh: makeQuote({ status: QuoteStatus.SENT, supersededById: 'q-2' }) });
    expect(await service.decide('ok', 'approve')).toEqual({ kind: 'not-sent', quoteNumber: 'COT-2026-001' });
    expect(notifications.sendQuoteApproved).not.toHaveBeenCalled();
  });

  it('un fallo al enviar el correo no tumba la decision', async () => {
    const { service, notifications } = setup();
    notifications.sendQuoteApproved.mockImplementation(() => {
      throw new Error('smtp caido');
    });
    expect(await service.decide('ok', 'approve')).toEqual({
      kind: 'success',
      status: QuoteStatus.APPROVED,
      quoteNumber: 'COT-2026-001',
    });
  });

  it('dos confirmaciones consecutivas: solo la primera notifica (idempotencia por estado)', async () => {
    const first = setup();
    await first.service.decide('ok', 'approve');
    const second = setup({ quote: makeQuote({ status: QuoteStatus.APPROVED }) });
    const r = await second.service.decide('ok', 'approve');
    expect(r.kind).toBe('already');
    expect(first.notifications.sendQuoteApproved).toHaveBeenCalledTimes(1);
    expect(second.notifications.sendQuoteApproved).not.toHaveBeenCalled();
  });
});
