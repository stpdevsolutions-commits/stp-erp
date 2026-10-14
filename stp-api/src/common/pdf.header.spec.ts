import { createHash } from 'crypto';
import { of, lastValueFrom } from 'rxjs';
import { drawDigitalSignature, LEFT, WIDTH } from './pdf.header';
import { ActorContextInterceptor } from './actor-context';

/** Solo se finge `Date`; el resto de relojes quedan reales (el interceptor usa Observables/timers). */
const ONLY_DATE: { doNotFake: any[] } = {
  doNotFake: [
    'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
    'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval',
    'clearInterval', 'setTimeout', 'clearTimeout',
  ],
};

const NOW = new Date('2026-10-14T16:30:00.000Z'); // 12:30 en República Dominicana (UTC-4)

function fakeDoc() {
  const doc: any = {
    fillColor: jest.fn(() => doc),
    font: jest.fn(() => doc),
    fontSize: jest.fn(() => doc),
    text: jest.fn(() => doc),
  };
  return doc;
}

const codeFor = (signer: string, ref: string, at: Date) =>
  createHash('sha256').update(`${signer}|${ref}|${at.toISOString()}`).digest('hex').slice(0, 12).toUpperCase();

const stampOf = (doc: any): string => doc.text.mock.calls[0][0];

describe('drawDigitalSignature', () => {
  beforeEach(() => {
    jest.useFakeTimers(ONLY_DATE).setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  it('formato: "Firmado digitalmente por <usuario>  ·  fecha/hora RD  ·  Cód. <12 hex>  ·  referencia"', () => {
    const doc = fakeDoc();
    drawDigitalSignature(doc, 'COT-0042', 'Ana Pérez');
    const code = codeFor('Ana Pérez', 'COT-0042', NOW);
    const m = stampOf(doc).match(/^Firmado digitalmente por (.+)  ·  (.+)  ·  Cód\. ([0-9A-F]{12})  ·  (.+)$/);
    expect(m).not.toBeNull();
    expect(m![1]).toBe('Ana Pérez');
    expect(m![3]).toBe(code);
    expect(m![4]).toBe('COT-0042');
    // fecha dd/mm/aa y hora en zona RD (12:30, no 16:30 UTC)
    expect(m![2]).toMatch(/^14\/10\/(20)?26/);
    expect(m![2]).toMatch(/12:30/);
    expect(m![2]).not.toMatch(/16:30/);
  });

  it('el código es SHA-256 en mayúsculas de "firmante|referencia|ISO", 12 caracteres, y es determinista', () => {
    const a = fakeDoc();
    const b = fakeDoc();
    drawDigitalSignature(a, 'FAC-1', 'Ana');
    drawDigitalSignature(b, 'FAC-1', 'Ana');
    expect(stampOf(a)).toBe(stampOf(b));
    expect(stampOf(a)).toContain(`Cód. ${codeFor('Ana', 'FAC-1', NOW)}`);
  });

  it('el código cambia si cambia el firmante, la referencia o la hora', () => {
    const code = (ref: string, name: string) => {
      const d = fakeDoc();
      drawDigitalSignature(d, ref, name);
      return stampOf(d).match(/Cód\. ([0-9A-F]{12})/)![1];
    };
    const base = code('FAC-1', 'Ana');
    expect(code('FAC-2', 'Ana')).not.toBe(base);
    expect(code('FAC-1', 'Beto')).not.toBe(base);
    jest.setSystemTime(new Date(NOW.getTime() + 1000));
    expect(code('FAC-1', 'Ana')).not.toBe(base);
  });

  it('fuera de una petición usa el autor del documento (recortado)', () => {
    const doc = fakeDoc();
    drawDigitalSignature(doc, 'COT-1', '  Carlos Díaz  ');
    expect(stampOf(doc)).toContain('Firmado digitalmente por Carlos Díaz  ·');
    expect(stampOf(doc)).toContain(`Cód. ${codeFor('Carlos Díaz', 'COT-1', NOW)}`);
  });

  it.each([[undefined], [null], [''], ['   ']])('sin autor (%j) cae en "Sistema STP ERP"', (fallback) => {
    const doc = fakeDoc();
    drawDigitalSignature(doc, 'COT-1', fallback as never);
    expect(stampOf(doc)).toContain('Firmado digitalmente por Sistema STP ERP  ·');
  });

  it('dentro de una petición manda el usuario autenticado, no el autor del documento', async () => {
    const doc = fakeDoc();
    const interceptor = new ActorContextInterceptor();
    const ctx = { switchToHttp: () => ({ getRequest: () => ({ user: { firstName: 'Luis', lastName: 'Mora' } }) }) } as never;
    await lastValueFrom(
      interceptor.intercept(ctx, {
        handle: () => {
          drawDigitalSignature(doc, 'COT-9', 'Autor Original');
          return of(true);
        },
      } as never),
    );
    expect(stampOf(doc)).toContain('Firmado digitalmente por Luis Mora  ·');
    expect(stampOf(doc)).not.toContain('Autor Original');
    expect(stampOf(doc)).toContain(`Cód. ${codeFor('Luis Mora', 'COT-9', NOW)}`);
  });

  it('se dibuja en la franja inferior (y=824), centrado, a todo el ancho útil y sin saltos de línea', () => {
    const doc = fakeDoc();
    drawDigitalSignature(doc, 'COT-1');
    const [, x, y, opts] = doc.text.mock.calls[0];
    expect([x, y]).toEqual([LEFT, 824]);
    expect(opts).toEqual({ width: WIDTH, align: 'center', lineBreak: false });
    expect(doc.font).toHaveBeenCalledWith('Helvetica-Bold');
    expect(doc.fontSize).toHaveBeenCalledWith(6.5);
  });
});
