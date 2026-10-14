import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DgiiService } from './dgii.service';

/** Portal de la DGII 100 % simulado: `global.fetch` se reemplaza; jamás sale una petición real. */
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', `${name}.html`), 'utf8');

const FORM_PAGE =
  '<input id="__VIEWSTATE" value="VS123" /><input id="__EVENTVALIDATION" value="EV456" />' +
  '<input id="__VIEWSTATEGENERATOR" value="GEN789" />';

const resp = (body: string, init: { ok?: boolean; status?: number; cookies?: string[] } = {}) =>
  ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: async () => body,
    headers: { getSetCookie: () => init.cookies ?? [] },
  }) as unknown as Response;

const MSG = 'No se pudo consultar la DGII en este momento. Inténtalo de nuevo en unos minutos.';

describe('DgiiService.lookupRnc (HTTP simulado)', () => {
  const realFetch = global.fetch;
  let fetchMock: jest.Mock;
  let timeoutSpy: jest.SpyInstance;
  const svc = new DgiiService();

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
  });
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('flujo feliz: abre la página, reenvía el estado del formulario con cookies y lee el contribuyente', async () => {
    fetchMock
      .mockResolvedValueOnce(resp(FORM_PAGE, { cookies: ['ASP.NET_SessionId=abc; path=/; HttpOnly', 'otra=1; path=/'] }))
      .mockResolvedValueOnce(resp(fixture('rnc-ok')));
    const r = await svc.lookupRnc('101099161');
    expect(r.found).toBe(true);
    expect(r.rnc).toBe('101099161');
    expect(r.name).toBe('AMABLE ARISTY CASTRO S R L');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [getUrl] = fetchMock.mock.calls[0];
    const [postUrl, postInit] = fetchMock.mock.calls[1];
    expect(String(getUrl)).toMatch(/^https:\/\/dgii\.gov\.do\//);
    expect(postUrl).toBe(getUrl);
    expect(postInit.method).toBe('POST');
    expect(postInit.headers.Cookie).toBe('ASP.NET_SessionId=abc; otra=1');
    const body = new URLSearchParams(postInit.body);
    expect(body.get('ctl00$cphMain$txtRNCCedula')).toBe('101099161');
    expect(body.get('__VIEWSTATE')).toBe('VS123');
    expect(body.get('__EVENTVALIDATION')).toBe('EV456');
    expect(body.get('__VIEWSTATEGENERATOR')).toBe('GEN789');
    expect(body.get('__ASYNCPOST')).toBe('true');
    expect(body.get('ctl00$cphMain$btnBuscarPorRNC')).toBe('BUSCAR');
  });

  it('cada petición lleva un tope de tiempo: 12 s para abrir la página', async () => {
    fetchMock.mockResolvedValueOnce(resp(FORM_PAGE)).mockResolvedValueOnce(resp(fixture('rnc-ok')));
    await svc.lookupRnc('101099161');
    expect(timeoutSpy).toHaveBeenCalledWith(12_000);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(fetchMock.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('timeout (TimeoutError) al abrir la página -> 503 con mensaje claro', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
    const p = svc.lookupRnc('101099161');
    await expect(p).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(p).rejects.toThrow(MSG);
  });

  it('timeout en el postback -> 503', async () => {
    fetchMock
      .mockResolvedValueOnce(resp(FORM_PAGE))
      .mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'));
    await expect(svc.lookupRnc('101099161')).rejects.toThrow(MSG);
  });

  it('red caída (fetch lanza) -> 503', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(svc.lookupRnc('101099161')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it.each([[500], [502], [503], [403]])('la DGII responde HTTP %i al abrir la página -> 503', async (status) => {
    fetchMock.mockResolvedValueOnce(resp('error', { ok: false, status }));
    await expect(svc.lookupRnc('101099161')).rejects.toThrow(MSG);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('la DGII responde HTTP 500 al postback -> 503', async () => {
    fetchMock.mockResolvedValueOnce(resp(FORM_PAGE)).mockResolvedValueOnce(resp('x', { ok: false, status: 500 }));
    await expect(svc.lookupRnc('101099161')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('página sin estado de formulario (la DGII cambió o devolvió basura) -> 503', async () => {
    fetchMock.mockResolvedValueOnce(resp('<html>mantenimiento</html>'));
    await expect(svc.lookupRnc('101099161')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('el 503 no filtra el detalle técnico al usuario', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET 10.0.0.5:443'));
    const err = await svc.lookupRnc('101099161').catch((e) => e);
    expect(err.message).toBe(MSG);
    expect(err.message).not.toMatch(/ECONNRESET|10\.0\.0\.5/);
  });
});
