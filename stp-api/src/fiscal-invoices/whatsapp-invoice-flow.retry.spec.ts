/* eslint-disable @typescript-eslint/no-explicit-any */
import { UnprocessableEntityException } from '@nestjs/common';
import { WhatsappInvoiceFlowService } from './whatsapp-invoice-flow.service';
import { ScanUnavailableException } from './scan-retry';

const busy = () => new ScanUnavailableException('El servicio de escaneo no respondió', true);

function build(scan: jest.Mock) {
  const whatsapp = { sendText: jest.fn(async (..._a: any[]) => undefined) };
  const svc = new WhatsappInvoiceFlowService(whatsapp as any, {} as any, { scan } as any, {} as any, {} as any, {} as any);
  const sleep = jest.fn(async () => undefined);
  (svc as any).sleep = sleep;
  return { svc, whatsapp, sleep };
}
const buf = Buffer.from('x');

describe('WhatsappInvoiceFlowService.scanWithRetry', () => {
  it('éxito tras reintentos: avisa una sola vez y devuelve la lectura', async () => {
    const scan = jest.fn().mockRejectedValueOnce(busy()).mockRejectedValueOnce(busy()).mockResolvedValueOnce({ ok: 1 });
    const { svc, whatsapp, sleep } = build(scan);
    await expect(svc.scanWithRetry('809', buf, 'image/png')).resolves.toEqual({ ok: 1 });
    expect(scan).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(whatsapp.sendText).toHaveBeenCalledTimes(1);
    expect(whatsapp.sendText.mock.calls[0][1]).toMatch(/saturado/);
  });

  it('agota los 4 intentos: un solo aviso inicial + mensaje final, y conserva la foto', async () => {
    const scan = jest.fn().mockRejectedValue(busy());
    const { svc, whatsapp } = build(scan);
    await expect(svc.scanWithRetry('809', buf, 'image/png')).resolves.toBeNull();
    expect(scan).toHaveBeenCalledTimes(4);
    const texts = whatsapp.sendText.mock.calls.map((c) => c[1] as string);
    expect(texts).toHaveLength(2);
    expect(texts[0]).toMatch(/Sigo intentando/);
    expect(texts[1]).toMatch(/reintentar/);
    expect((svc as any).failedMedia.get('809').buffer).toBe(buf);
  });

  it('error permanente (no 503): no reintenta, sin aviso de saturación', async () => {
    const scan = jest.fn().mockRejectedValue(new UnprocessableEntityException('ilegible'));
    const { svc, whatsapp, sleep } = build(scan);
    await expect(svc.scanWithRetry('809', buf, 'image/png')).resolves.toBeNull();
    expect(scan).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(whatsapp.sendText).toHaveBeenCalledTimes(1);
    expect((svc as any).failedMedia.has('809')).toBe(false);
  });

  it('ScanUnavailableException no pasajera (clave/saldo): tampoco reintenta', async () => {
    const scan = jest.fn().mockRejectedValue(new ScanUnavailableException('sin saldo', false));
    const { svc } = build(scan);
    await svc.scanWithRetry('809', buf, 'image/png');
    expect(scan).toHaveBeenCalledTimes(1);
  });
});
