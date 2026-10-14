import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { ScanUnavailableException, isTransientDetail, isTransientScanError, retryDelayMs } from './scan-retry';

describe('scan-retry', () => {
  it.each(['429', '500', '502', '503', '504'])('el %s es pasajero', (c) => {
    expect(isTransientDetail(`HTTP ${c}: algo`)).toBe(true);
  });
  it.each(['400', '401', '403'])('el %s no se reintenta', (c) => {
    expect(isTransientDetail(`HTTP ${c}: credit balance too low`)).toBe(false);
  });
  it('mensajes del SDK de Gemini y timeouts son pasajeros', () => {
    expect(isTransientDetail('{"error":{"code":503,"status":"UNAVAILABLE","message":"high demand"}}')).toBe(true);
    expect(isTransientDetail('The operation was aborted due to timeout')).toBe(true);
    expect(isTransientDetail('fetch failed')).toBe(true);
  });
  it('el status numérico manda sobre el texto', () => {
    expect(isTransientDetail('lo que sea', 503)).toBe(true);
    expect(isTransientDetail('quota', 403)).toBe(false);
  });
  it('isTransientScanError respeta la marca; un 503 genérico cuenta como pasajero; lo demás no', () => {
    expect(isTransientScanError(new ScanUnavailableException('x', false))).toBe(false);
    expect(isTransientScanError(new ScanUnavailableException('x', true))).toBe(true);
    expect(isTransientScanError(new ServiceUnavailableException('x'))).toBe(true);
    expect(isTransientScanError(new UnprocessableEntityException('x'))).toBe(false);
    expect(isTransientScanError(new Error('x'))).toBe(false);
  });
  it('backoff exponencial con jitter ±25 % y tope', () => {
    expect(retryDelayMs(1, 5000, () => 0.5)).toBe(5000);
    expect(retryDelayMs(2, 5000, () => 0.5)).toBe(10000);
    expect(retryDelayMs(3, 5000, () => 0)).toBe(15000);
    expect(retryDelayMs(3, 5000, () => 1)).toBe(25000);
    expect(retryDelayMs(10, 5000, () => 0.5)).toBe(90000);
  });
});
