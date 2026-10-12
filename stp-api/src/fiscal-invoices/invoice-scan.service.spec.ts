/* eslint-disable @typescript-eslint/no-explicit-any */
import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { InvoiceScanService } from './invoice-scan.service';

const config = (env: Record<string, string>) => ({ get: (k: string) => env[k] }) as any;
const PNG = Buffer.from('\x89PNG\r\n\x1a\n', 'binary');

describe('InvoiceScanService', () => {
  describe('qué proveedor se usa', () => {
    it('sin ninguna clave: ninguno', () => {
      expect(new InvoiceScanService(config({})).provider()).toBeNull();
    });
    it('solo Gemini (lo que hay hoy en el ERP)', () => {
      expect(new InvoiceScanService(config({ GEMINI_API_KEY: 'g' })).provider()).toBe('gemini');
    });
    it('solo Claude', () => {
      expect(new InvoiceScanService(config({ ANTHROPIC_API_KEY: 'a' })).provider()).toBe('claude');
    });
    it('con las dos, gana Claude (igual que en FiscoRD)', () => {
      expect(new InvoiceScanService(config({ ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' })).provider()).toBe('claude');
    });
    it('INVOICE_SCAN_PROVIDER fuerza uno si su clave existe', () => {
      expect(
        new InvoiceScanService(config({ ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g', INVOICE_SCAN_PROVIDER: 'gemini' })).provider(),
      ).toBe('gemini');
    });
    it('forzar uno SIN su clave no apaga el escaneo: cae al que sí está configurado', () => {
      expect(new InvoiceScanService(config({ GEMINI_API_KEY: 'g', INVOICE_SCAN_PROVIDER: 'claude' })).provider()).toBe('gemini');
    });
  });

  it('sin clave, leer da un 503 que dice qué hacer (no un error técnico)', async () => {
    const svc = new InvoiceScanService(config({}));
    await expect(svc.read(PNG, 'image/png')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(svc.read(PNG, 'image/png')).rejects.toThrow('Registra la factura a mano');
  });

  describe('respaldo entre proveedores', () => {
    const original = global.fetch;
    afterEach(() => {
      global.fetch = original;
    });
    const both = { ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g', INVOICE_SCAN_PROVIDER: 'gemini' };
    const claudeOk = () =>
      jest.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ content: [{ type: 'text', text: '{"ncf":"B0100000012"}' }] }) }) as any);

    it('el orden: el preferido primero y el otro de respaldo (solo si tiene clave)', () => {
      expect(new InvoiceScanService(config(both)).providers()).toEqual(['gemini', 'claude']);
      expect(new InvoiceScanService(config({ ...both, INVOICE_SCAN_PROVIDER: 'claude' })).providers()).toEqual(['claude', 'gemini']);
      expect(new InvoiceScanService(config({ GEMINI_API_KEY: 'g' })).providers()).toEqual(['gemini']);
      expect(new InvoiceScanService(config({})).providers()).toEqual([]);
    });

    it('si el preferido responde, el respaldo ni se llama', async () => {
      const fetchMock = claudeOk();
      global.fetch = fetchMock as any;
      const svc = new InvoiceScanService(config(both));
      jest.spyOn(svc as any, 'callGemini').mockResolvedValue('{"ncf":"B0100000099"}');
      const { raw, provider } = await svc.read(PNG, 'image/png');
      expect(provider).toBe('gemini');
      expect(raw).toEqual({ ncf: 'B0100000099' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('si el preferido falla (cuota, caída), usa el otro', async () => {
      global.fetch = claudeOk() as any;
      const svc = new InvoiceScanService(config(both));
      jest.spyOn(svc as any, 'callGemini').mockRejectedValue(new ServiceUnavailableException('cuota'));
      const { provider } = await svc.read(PNG, 'image/png');
      expect(provider).toBe('claude');
    });

    it('en la lectura siguiente vuelve a intentar con el preferido', async () => {
      global.fetch = claudeOk() as any;
      const svc = new InvoiceScanService(config(both));
      const gemini = jest
        .spyOn(svc as any, 'callGemini')
        .mockRejectedValueOnce(new ServiceUnavailableException('cuota'))
        .mockResolvedValueOnce('{"ncf":"B0100000012"}');
      expect((await svc.read(PNG, 'image/png')).provider).toBe('claude');
      expect((await svc.read(PNG, 'image/png')).provider).toBe('gemini');
      expect(gemini).toHaveBeenCalledTimes(2);
    });

    it('si fallan los dos, el error es el del preferido', async () => {
      global.fetch = jest.fn(async () => ({ ok: false, status: 500, text: async () => 'x' }) as any) as any;
      const svc = new InvoiceScanService(config(both));
      jest.spyOn(svc as any, 'callGemini').mockRejectedValue(new ServiceUnavailableException('límite de Gemini'));
      await expect(svc.read(PNG, 'image/png')).rejects.toThrow('límite de Gemini');
    });
  });

  describe('Claude (la petición exacta; sin clave real no se puede probar en vivo)', () => {
    const original = global.fetch;
    afterEach(() => {
      global.fetch = original;
    });
    const reply = (text: string, ok = true, status = 200) =>
      jest.fn(async () => ({ ok, status, text: async () => JSON.stringify({ content: [{ type: 'text', text }] }) }) as any);

    it('manda la clave, la versión, el modelo, el sistema y la imagen en base64; y lee el JSON de la respuesta', async () => {
      const fetchMock = reply('```json\n{"ncf":"B0100000012","baseAmount":100}\n```');
      global.fetch = fetchMock as any;
      const svc = new InvoiceScanService(config({ ANTHROPIC_API_KEY: 'sk-test' }));

      const { raw, provider } = await svc.read(PNG, 'image/png');
      expect(provider).toBe('claude');
      expect(raw).toEqual({ ncf: 'B0100000012', baseAmount: 100 });

      const [url, init] = fetchMock.mock.calls[0] as any[];
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect(init.headers['x-api-key']).toBe('sk-test');
      expect(init.headers['anthropic-version']).toBe('2023-06-01');
      const body = JSON.parse(init.body);
      expect(body.model).toBe('claude-haiku-4-5-20251001');
      expect(body.system).toContain('Formato 606');
      const [file, prompt] = body.messages[0].content;
      expect(file).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG.toString('base64') } });
      expect(prompt.text).toContain('Responde SOLO con un objeto JSON');
    });

    it('un PDF va como bloque "document"', async () => {
      const fetchMock = reply('{}');
      global.fetch = fetchMock as any;
      await new InvoiceScanService(config({ ANTHROPIC_API_KEY: 'k' })).read(Buffer.from('%PDF-1.7'), 'application/pdf');
      const body = JSON.parse((fetchMock.mock.calls[0] as any[])[1].body);
      expect(body.messages[0].content[0]).toMatchObject({ type: 'document', source: { media_type: 'application/pdf' } });
    });

    it('el modelo se cambia por entorno', async () => {
      const fetchMock = reply('{}');
      global.fetch = fetchMock as any;
      await new InvoiceScanService(config({ ANTHROPIC_API_KEY: 'k', ANTHROPIC_MODEL: 'otro-modelo' })).read(PNG, 'image/png');
      expect(JSON.parse((fetchMock.mock.calls[0] as any[])[1].body).model).toBe('otro-modelo');
    });

    it('si Anthropic falla (429, 500…): 503 amable, y el detalle técnico NO llega al usuario', async () => {
      global.fetch = jest.fn(async () => ({ ok: false, status: 429, text: async () => 'rate_limit secret-detail' }) as any) as any;
      const err = await new InvoiceScanService(config({ ANTHROPIC_API_KEY: 'k' })).read(PNG, 'image/png').catch((e) => e);
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect(String(err.message)).not.toContain('secret-detail');
      expect(String(err.message)).not.toContain('429');
    });

    it('cuota agotada (429): lo dice, y no inventa que "reintente en unos minutos"', async () => {
      global.fetch = jest.fn(async () => ({ ok: false, status: 429, text: async () => 'rate_limit_error' }) as any) as any;
      const err = await new InvoiceScanService(config({ ANTHROPIC_API_KEY: 'k' })).read(PNG, 'image/png').catch((e) => e);
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect(String(err.message)).toContain('Se agotó el límite');
      expect(String(err.message)).not.toContain('429');
    });

    it('una respuesta que no es JSON → 422 con consejo sobre la foto', async () => {
      global.fetch = reply('lo siento, no puedo leer esto') as any;
      const err = await new InvoiceScanService(config({ ANTHROPIC_API_KEY: 'k' })).read(PNG, 'image/png').catch((e) => e);
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      expect(String(err.message)).toContain('foto sea clara');
    });
  });
});
