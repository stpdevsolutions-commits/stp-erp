/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConfigService } from '@nestjs/config';
import { InvoiceScanService } from './invoice-scan.service';
import { normalizeScan } from './invoice-scan';
import {
  extractFromPdfText,
  parseAmount,
  parseDate,
  parseInvoiceText,
  rncChecksumOk,
} from './pdf-text-extractor';

/**
 * pdf.js arranca su "worker" con un import() dinámico que Jest (sin --experimental-vm-modules) no
 * permite, así que aquí `pdf-parse` se sustituye por un lector mínimo de los PDF sintéticos de esta
 * prueba (texto `(...) Tj` sin comprimir). La librería real se verificó fuera de Jest contra PDF reales.
 */
jest.mock('pdf-parse', () => ({
  PDFParse: class {
    private readonly pdf: string;
    constructor(o: { data: Uint8Array }) {
      this.pdf = Buffer.from(o.data).toString('latin1');
    }
    async getText(): Promise<{ text: string }> {
      if (!this.pdf.startsWith('%PDF-') || !this.pdf.includes('%%EOF')) throw new Error('InvalidPDFException');
      const pages = this.pdf.split('/Type /Page\n').slice(1);
      const text = pages
        .map((p, i) => {
          const lines = [...p.matchAll(/\(([^)]*)\)\s*Tj/g)].map((m) => m[1]);
          return `${lines.join('\n')}\n\n-- ${i + 1} of ${pages.length} --\n\n`;
        })
        .join('');
      return { text };
    }
    async destroy(): Promise<void> {}
  },
}));

/** PDF sintético: una página por cada texto (sin texto = página solo con un dibujo, como un escaneo). */
function makePdf(pages: string[]): Promise<Buffer> {
  const body = pages
    .map((t) => {
      const lines = t ? t.split('\n').map((l, i) => `BT /F1 11 Tf 50 ${750 - i * 14} Td (${l}) Tj ET`) : ['0.5 g 50 50 300 200 re f'];
      return `/Type /Page\n${lines.join('\n')}\n`;
    })
    .join('');
  return Promise.resolve(Buffer.from(`%PDF-1.4\n${body}%%EOF\n`, 'latin1'));
}

// RNC de 9 dígitos con dígito verificador correcto, calculado para la prueba.
function rncWithCheck(base8: string): string {
  const w = [7, 9, 8, 6, 5, 4, 3, 2];
  const r = w.reduce((a, wi, i) => a + wi * Number(base8[i]), 0) % 11;
  return base8 + String(r === 0 ? 2 : r === 1 ? 1 : 11 - r);
}
const RNC = rncWithCheck('13099187');

const PAPER = `FERRETERIA EJEMPLO SRL
RNC: ${RNC}
Comprobante Fiscal
NCF: B0100000123
Fecha: 05/10/2026
Subtotal RD$ 1,000.00
ITBIS 18%: RD$ 180.00
Total a pagar: RD$ 1,180.00`;

const ECF = `Servicios Demo SRL
RNC Emisor: ${RNC.slice(0, 1)}-${RNC.slice(1, 3)}-${RNC.slice(3, 8)}-${RNC.slice(8)}
Factura de Crédito Fiscal Electrónica
e-NCF: E310000000045
Fecha de emisión: 2026-09-30
RNC Comprador: 101010101
Monto gravado total: 2,500.00
Total ITBIS: 450.00
Monto Total: RD$ 2,950.00`;

describe('utilidades', () => {
  it('parseAmount: miles con coma, decimales y formato europeo', () => {
    expect(parseAmount('RD$ 1,234.50')).toBe(1234.5);
    expect(parseAmount('1234.5')).toBe(1234.5);
    expect(parseAmount('1.234,50')).toBe(1234.5);
    expect(parseAmount('12,345')).toBe(12345);
    expect(parseAmount('abc')).toBeNull();
  });
  it('parseDate: formatos dominicanos', () => {
    expect(parseDate('05/10/2026')).toBe('2026-10-05');
    expect(parseDate('5-10-2026')).toBe('2026-10-05');
    expect(parseDate('05.10.26')).toBe('2026-10-05');
    expect(parseDate('2026-09-30')).toBe('2026-09-30');
    expect(parseDate('5 de octubre de 2026')).toBe('2026-10-05');
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseDate('sin fecha')).toBeNull();
  });
  it('rncChecksumOk acepta el dígito correcto y rechaza otro', () => {
    expect(rncChecksumOk(RNC)).toBe(true);
    expect(rncChecksumOk(RNC.slice(0, 8) + ((Number(RNC[8]) + 1) % 10))).toBe(false);
  });
});

describe('parseInvoiceText', () => {
  it('factura de papel B01 con todo', () => {
    const r = parseInvoiceText(PAPER)!;
    expect(r.fields).toMatchObject({
      ncf: 'B0100000123',
      supplierRnc: RNC,
      invoiceDate: '2026-10-05',
      baseAmount: 1000,
      itbis: 180,
      totalAmount: 1180,
      supplierName: 'FERRETERIA EJEMPLO SRL',
    });
    expect(r.confidence.ncf).toBe('high');
    expect(r.raw.confidence).toBe('high');
    // La forma es la que consume normalizeScan, sin avisos.
    const core = normalizeScan(r.raw);
    expect(core.warnings).toEqual([]);
    expect(core.totalAmount).toBe(1180);
  });

  it('e-CF E31 con RNC con guiones y distinguiendo el RNC del comprador', () => {
    const r = parseInvoiceText(ECF)!;
    expect(r.fields.ncf).toBe('E310000000045');
    expect(r.fields.supplierRnc).toBe(RNC);
    expect(r.fields.invoiceDate).toBe('2026-09-30');
    expect(r.fields.itbis).toBe(450);
    expect(r.fields.baseAmount).toBe(2500);
    expect(r.fields.totalAmount).toBe(2950);
  });

  it('NCF con guiones/espacios y fecha en letras', () => {
    const r = parseInvoiceText(`Suministros SRL\nRNC ${RNC}\nNCF B02-00000077\nFecha: 5 de octubre de 2026\nTOTAL 590.00`)!;
    expect(r.fields.ncf).toBe('B0200000077');
    expect(r.fields.invoiceDate).toBe('2026-10-05');
    expect(r.fields.totalAmount).toBe(590);
    expect(r.fields.itbis).toBeNull();
    expect(r.raw.missing).toEqual(expect.arrayContaining(['itbis', 'baseAmount']));
    expect(r.raw.confidence).toBe('medium');
  });

  it('cédula de 11 dígitos como RNC del emisor', () => {
    const r = parseInvoiceText(`Juan Perez\nRNC/Cédula: 001-1234567-8\nNCF: B1400000009\nFecha: 01/09/2026\nTotal: 1,500.00`)!;
    expect(r.fields.supplierRnc).toBe('00112345678');
    expect(r.fields.ncf).toBe('B1400000009');
  });

  it('exige NCF válido: un NCF mal formado no cuenta', () => {
    expect(parseInvoiceText(PAPER.replace('B0100000123', 'B9900000123'))).toBeNull();
    expect(parseInvoiceText(PAPER.replace('B0100000123', 'B010000012'))).toBeNull();
    expect(parseInvoiceText(PAPER.replace(/NCF: B0100000123\n/, ''))).toBeNull();
  });
  it('exige RNC y total', () => {
    expect(parseInvoiceText(PAPER.replace(/RNC: \d+\n/, ''))).toBeNull();
    expect(parseInvoiceText(PAPER.replace(/Total a pagar.*/, ''))).toBeNull();
  });
  it('rechaza un total incoherente (menor que base + ITBIS)', () => {
    expect(parseInvoiceText(PAPER.replace('RD$ 1,180.00', 'RD$ 800.00'))).toBeNull();
  });
  it('no confunde el "Subtotal" con el total', () => {
    const r = parseInvoiceText(PAPER.replace(/Total a pagar.*/, 'Subtotal 9,999.00'));
    expect(r).toBeNull();
  });
  it('no toma el RNC del comprador aunque aparezca primero', () => {
    const t = `Cliente RNC: 101010101\n${PAPER}`;
    expect(parseInvoiceText(t)!.fields.supplierRnc).toBe(RNC);
  });
});

describe('extractFromPdfText (PDF real generado)', () => {
  it('lee el PDF de papel', async () => {
    const r = await extractFromPdfText(await makePdf([PAPER]));
    expect(r?.fields.ncf).toBe('B0100000123');
    expect(r?.fields.totalAmount).toBe(1180);
  });
  it('lee el e-CF aunque el total esté en otra página', async () => {
    const half = ECF.split('Monto gravado')[0];
    const r = await extractFromPdfText(await makePdf([half, 'Monto gravado total: 2,500.00\nTotal ITBIS: 450.00\nMonto Total: RD$ 2,950.00']));
    expect(r?.fields.ncf).toBe('E310000000045');
    expect(r?.fields.totalAmount).toBe(2950);
  });
  it('PDF sin capa de texto (imagen): null, para que decida la IA', async () => {
    expect(await extractFromPdfText(await makePdf(['']))).toBeNull();
  });
  it('PDF con texto pero sin NCF: null', async () => {
    expect(await extractFromPdfText(await makePdf([PAPER.replace('B0100000123', '').replace('NCF:', 'Nota:')]))).toBeNull();
  });
  it('basura, vacío o demasiado grande: null y sin lanzar', async () => {
    expect(await extractFromPdfText(Buffer.from('%PDF-1.4 roto'))).toBeNull();
    expect(await extractFromPdfText(Buffer.alloc(0))).toBeNull();
    expect(await extractFromPdfText(Buffer.alloc(9 * 1024 * 1024, 1))).toBeNull();
  });
});

describe('InvoiceScanService.read con PDF', () => {
  const cfg = (env: Record<string, string>) => ({ get: (k: string) => env[k] }) as unknown as ConfigService;

  it('PDF con texto suficiente: source pdf-text, sin llamar a la IA (ni siquiera con clave)', async () => {
    const svc = new InvoiceScanService(cfg({ GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' }));
    const gemini = jest.spyOn(svc as any, 'callGemini');
    const claude = jest.spyOn(svc as any, 'callClaude');
    const res = await svc.read(await makePdf([PAPER]), 'application/pdf');
    expect(res.source).toBe('pdf-text');
    expect(res.provider).toBeNull();
    expect((res.raw as any).ncf).toBe('B0100000123');
    expect(gemini).not.toHaveBeenCalled();
    expect(claude).not.toHaveBeenCalled();
  });

  it('PDF sin capa de texto: cae a la IA', async () => {
    const svc = new InvoiceScanService(cfg({ GEMINI_API_KEY: 'g' }));
    jest.spyOn(svc as any, 'callGemini').mockResolvedValue('{"ncf":"B0100000099"}');
    const res = await svc.read(await makePdf(['']), 'application/pdf');
    expect(res).toMatchObject({ provider: 'gemini', source: 'ia', raw: { ncf: 'B0100000099' } });
  });

  it('PDF con texto pero sin NCF: cae a la IA', async () => {
    const svc = new InvoiceScanService(cfg({ GEMINI_API_KEY: 'g' }));
    const gemini = jest.spyOn(svc as any, 'callGemini').mockResolvedValue('{"ncf":"B0100000099"}');
    const pdf = await makePdf(['Cotizacion de servicios\nCliente: Fulano\nTotal: 5,000.00\nValida por 30 dias, sujeta a cambios sin previo aviso.']);
    const res = await svc.read(pdf, 'application/pdf');
    expect(res.source).toBe('ia');
    expect(gemini).toHaveBeenCalledTimes(1);
  });

  it('las imágenes ni intentan leer texto: van directo a la IA', async () => {
    const svc = new InvoiceScanService(cfg({ GEMINI_API_KEY: 'g' }));
    const gemini = jest.spyOn(svc as any, 'callGemini').mockResolvedValue('{"ncf":"B0100000099"}');
    const res = await svc.read(Buffer.from('\x89PNG\r\n\x1a\n', 'binary'), 'image/png');
    expect(res.source).toBe('ia');
    expect(gemini).toHaveBeenCalled();
  });

  it('PDF con texto y sin ninguna clave de IA: se lee igual (antes daba 503)', async () => {
    const res = await new InvoiceScanService(cfg({})).read(await makePdf([PAPER]), 'application/pdf');
    expect(res.source).toBe('pdf-text');
  });
});
