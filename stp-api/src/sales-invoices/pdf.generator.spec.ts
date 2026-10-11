import { generateSalesInvoicePdf } from './pdf.generator';
import { SalesInvoice, SalesInvoiceKind, SalesInvoiceStatus } from './entities/sales-invoice.entity';
import { COMPANY } from '../common/company';

const base = (over: Partial<SalesInvoice> = {}, nLines = 2): SalesInvoice =>
  ({
    id: 'i1',
    number: 'FAC-2026-001',
    clientId: 'c1',
    client: { name: 'Cliente de Prueba', rnc: '132943058' },
    project: { code: 'PRJ-1', name: 'Proyecto uno' },
    issueDate: '2026-10-10',
    dueDate: null,
    notes: 'Avance del 30% de la cotización COT-1',
    status: SalesInvoiceStatus.DRAFT,
    subtotal: 1000 * nLines,
    itbis: 180 * nLines,
    total: 1180 * nLines,
    lines: Array.from({ length: nLines }, (_, i) => ({
      description: `Partida ${i + 1} con una descripción un poco larga para probar el ajuste de línea`,
      quantity: 1,
      unitPrice: 1000,
      itbisRate: 18,
      goodOrService: 2,
      total: 1000,
      itbisAmount: 180,
    })),
    ...over,
  }) as unknown as SalesInvoice;

describe('PDF de la factura de venta', () => {
  it('genera un PDF válido para un borrador', async () => {
    const buf = await generateSalesInvoicePdf(base(), COMPANY);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(2000);
  });

  it('genera uno emitido con e-NCF y cobros', async () => {
    const buf = await generateSalesInvoicePdf(
      base({
        status: SalesInvoiceStatus.ISSUED,
        ecfEncf: 'E310000000005',
        ecfTipo: 'e-CF_31_v_1_0',
        ecfCodigoSeguridad: 'pXQ8QZ',
        ecfQrUrl: 'https://ecf.dgii.gov.do/testecf/consultatimbre?rncemisor=132943058&encf=E310000000005',
        paidAmount: 500,
        balance: 1860,
        dueDate: '2026-11-10',
      }),
      COMPANY,
    );
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('genera una nota de crédito con la referencia a la factura y el QR', async () => {
    const buf = await generateSalesInvoicePdf(
      base({
        kind: SalesInvoiceKind.CREDIT_NOTE,
        number: 'NC-2026-001',
        status: SalesInvoiceStatus.ISSUED,
        ecfEncf: 'E340000000001',
        ecfTipo: 'e-CF_34_v_1_0',
        ecfCodigoSeguridad: 'abc123',
        ecfQrUrl: 'https://ecf.dgii.gov.do/testecf/consultatimbre?encf=E340000000001',
        modificationCode: 1,
        reason: 'Se anula por error de facturación',
        relatedInvoice: { ecfEncf: 'E310000000005', number: 'FAC-2026-001' } as never,
      }),
      COMPANY,
    );
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    // el QR es una imagen incrustada
    expect(buf.toString('latin1')).toContain('/Subtype /Image');
  });

  it('pagina cuando hay muchas líneas', async () => {
    const buf = await generateSalesInvoicePdf(base({}, 60), COMPANY);
    const pages = (buf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
    expect(pages).toBeGreaterThan(1);
  });
});
