import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { SalesInvoice } from './entities/sales-invoice.entity';
import { SalesInvoiceKind } from './entities/sales-invoice.entity';
import { findLogoPath } from '../common/logo.utils';
import { DARK_BLUE, MID_GRAY, DARK_TEXT, BORDER_GRAY, LEFT, RIGHT, WIDTH, textLine, textHeight, drawDigitalSignature } from '../common/pdf.header';
import type { CompanyData } from '../common/company';
import { formatRD } from '../common/money';

/** Datos del comprobante que solo trae el XML firmado (ecf-api). */
export interface EcfPrintInfo {
  /** 'dd-MM-aaaa HH:mm:ss' */
  fechaFirma?: string | null;
  /** 'dd-MM-aaaa' — vencimiento de la secuencia autorizada del e-NCF. */
  fechaVencimiento?: string | null;
}

const PAGE_H = 842;
const ROWS_BOTTOM = 785;
/** El código QR va abajo a la izquierda: a 2 cm del borde y de al menos 22 x 22 mm (Informe Técnico e-CF, 18.2.3). */
const QR_X = 58;
const QR_SIZE = 86;
const QR_Y = 700;
/** Si el contenido llega más abajo, el QR y las firmas pasan a una hoja nueva. */
const QR_RESERVE_TOP = QR_Y - 12;

// Tabla de detalle (495 pt): Cant · E · Descripción · Unidad · Precio · ITBIS · Valor
const X_QTY = LEFT;
const W_QTY = 36;
const X_E = X_QTY + W_QTY;
const W_E = 14;
const X_DESC = X_E + W_E;
const W_DESC = 186;
const X_UNIT = X_DESC + W_DESC + 4;
const W_UNIT = 46;
const X_PRICE = X_UNIT + W_UNIT;
const W_PRICE = 66;
const X_ITBIS = X_PRICE + W_PRICE;
const W_ITBIS = 60;
const X_VALUE = X_ITBIS + W_ITBIS;
const W_VALUE = RIGHT - X_VALUE;

const TIPOS: Record<string, string> = {
  '31': 'Factura de Crédito Fiscal Electrónica',
  '32': 'Factura de Consumo Electrónica',
  '33': 'Nota de Débito Electrónica',
  '34': 'Nota de Crédito Electrónica',
  '41': 'Comprobante Electrónico de Compras',
  '43': 'Comprobante Electrónico para Gastos Menores',
  '44': 'Comprobante Electrónico para Regímenes Especiales',
  '45': 'Comprobante Electrónico Gubernamental',
  '46': 'Comprobante Electrónico para Exportaciones',
  '47': 'Comprobante Electrónico para Pagos al Exterior',
};

const CODIGO_MODIFICACION: Record<number, string> = {
  1: 'Anula el NCF modificado',
  2: 'Corrige texto del comprobante fiscal modificado',
  3: 'Corrige montos del NCF modificado',
  4: 'Reemplazo de NCF emitido en contingencia',
};

/** 'YYYY-MM-DD' → 'dd-MM-aaaa' (sin pasar por Date: no hay desfase de zona). */
const fecha = (d: string) => d.slice(0, 10).split('-').reverse().join('-');
const num = (n: number) => formatRD(n).replace('RD$ ', '');

/**
 * Representación impresa de un e-CF emitido, en el orden y lugar que exige el Informe Técnico
 * de la DGII (sección 18): datos del emisor a la izquierda, tipo, e-NCF y vencimiento a la
 * derecha, cliente debajo, detalle con "E" en lo exento, subtotales, y el código QR abajo a la
 * izquierda con el código de seguridad y la fecha de firma. El encabezado se repite en cada hoja.
 */
export async function generateEcfRepresentationPdf(
  invoice: SalesInvoice,
  company: CompanyData,
  info: EcfPrintInfo = {},
): Promise<Buffer> {
  // Margen de 4 módulos alrededor: a 86 pt equivale a ~3 mm de zona blanca.
  const qr = invoice.ecfQrUrl
    ? await QRCode.toBuffer(invoice.ecfQrUrl, { margin: 4, width: 360, errorCorrectionLevel: 'M' })
    : null;
  const logo = findLogoPath();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: 'A4', autoFirstPage: true, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const numeroTipo = invoice.ecfTipo?.match(/e-CF_(\d+)/)?.[1] ?? '';
    const isCreditNote = invoice.kind === SalesInvoiceKind.CREDIT_NOTE;
    // Sin vencimiento en la nota de crédito ni en la factura de consumo (nota 43 del Informe Técnico).
    const muestraVencimiento = numeroTipo !== '34' && numeroTipo !== '32' && !!info.fechaVencimiento;
    const legalName = company.legalName ?? company.name;

    /** Encabezado completo (se repite en cada hoja). Devuelve la y donde empieza el detalle. */
    const encabezado = (): number => {
      if (logo) {
        try {
          doc.image(logo, LEFT, 24, { fit: [56, 56] });
        } catch {
          /* el logo no es esencial */
        }
      }
      // Emisor, a la izquierda.
      const ix = LEFT + 66;
      const iw = 180;
      doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(10.5).text(legalName, ix, 24, { width: iw });
      let ly = 24 + textHeight(doc, legalName, iw) + 3;
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(8.5);
      for (const l of [
        `RNC: ${company.rnc}`,
        company.address1,
        company.address2,
        `Fecha Emisión: ${fecha(invoice.issueDate)}`,
      ]) {
        doc.text(l, ix, ly, { width: iw, lineBreak: false });
        ly += 11.5;
      }

      // Tipo, e-NCF, vencimiento y (en notas) el comprobante que modifica, a la derecha.
      const rx = 300;
      const rw = RIGHT - rx;
      const tipo = TIPOS[numeroTipo] ?? 'Comprobante Fiscal Electrónico';
      doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(12.5).text(tipo, rx, 24, { width: rw, align: 'right' });
      let ry = 24 + textHeight(doc, tipo, rw) + 4;
      const LABEL_W = 108;
      const fila = (etiqueta: string, valor: string) => {
        doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(9).text(`${etiqueta}:`, rx, ry, { width: LABEL_W, lineBreak: false });
        doc.font('Helvetica').text(valor, rx + LABEL_W, ry, { width: rw - LABEL_W, align: 'right' });
        ry += Math.max(12, doc.heightOfString(valor, { width: rw - LABEL_W }) + 2);
      };
      fila('e-NCF', invoice.ecfEncf ?? '');
      if (muestraVencimiento) fila('Fecha Vencimiento', info.fechaVencimiento!);
      if (isCreditNote) {
        fila('e-NCF Modificado', invoice.relatedInvoice?.ecfEncf ?? '—');
        fila('Código de Modificación', CODIGO_MODIFICACION[invoice.modificationCode ?? 1] ?? String(invoice.modificationCode ?? ''));
      }

      // Cliente, debajo.
      let y = Math.max(ly, ry) + 10;
      doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(DARK_BLUE).lineWidth(1).stroke();
      y += 8;
      const nombre = invoice.client?.name ?? '—';
      doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(9.5).text('Razón Social Cliente: ', LEFT, y, { width: WIDTH, continued: true });
      doc.font('Helvetica').text(nombre);
      y += Math.max(textHeight(doc, `Razón Social Cliente: ${nombre}`, WIDTH), 12) + 2;
      if (invoice.client?.rnc) {
        doc.font('Helvetica-Bold').text('RNC Cliente: ', LEFT, y, { width: WIDTH, continued: true });
        doc.font('Helvetica').text(invoice.client.rnc);
        y += 14;
      }
      doc.moveTo(LEFT, y + 2).lineTo(RIGHT, y + 2).strokeColor(DARK_BLUE).lineWidth(1).stroke();
      return y + 10;
    };

    const cabeceraTabla = (y: number): number => {
      doc.rect(LEFT, y, WIDTH, 18).fill('#d1d5db');
      doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(8);
      doc.text('Cant', X_QTY + 4, y + 5, { width: W_QTY - 6, lineBreak: false });
      doc.text('Descripción', X_DESC, y + 5, { width: W_DESC, lineBreak: false });
      doc.text('Unidad', X_UNIT, y + 5, { width: W_UNIT, lineBreak: false });
      doc.text('Precio RD$', X_PRICE, y + 5, { width: W_PRICE - 4, align: 'right', lineBreak: false });
      doc.text('ITBIS RD$', X_ITBIS, y + 5, { width: W_ITBIS - 4, align: 'right', lineBreak: false });
      doc.text('Valor RD$', X_VALUE, y + 5, { width: W_VALUE - 4, align: 'right', lineBreak: false });
      return y + 18;
    };

    let y = cabeceraTabla(encabezado());

    // ── Detalle ─────────────────────────────────────────────────────────────
    invoice.lines.forEach((l) => {
      doc.font('Helvetica').fontSize(9);
      const h = Math.max(textHeight(doc, l.description, W_DESC), doc.currentLineHeight()) + 8;
      if (y + h > ROWS_BOTTOM) {
        doc.addPage();
        y = cabeceraTabla(encabezado());
      }
      const itbis = l.itbisAmount ?? (l.total * l.itbisRate) / 100;
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9);
      doc.text(String(l.quantity), X_QTY + 4, y + 4, { width: W_QTY - 6, lineBreak: false });
      if (l.itbisRate === 0) doc.font('Helvetica-Bold').text('E', X_E, y + 4, { width: W_E, lineBreak: false });
      doc.font('Helvetica').text(l.description, X_DESC, y + 4, { width: W_DESC });
      doc.text(l.unit || '-', X_UNIT, y + 4, { width: W_UNIT, lineBreak: false, ellipsis: true });
      doc.text(num(l.unitPrice), X_PRICE, y + 4, { width: W_PRICE - 4, align: 'right', lineBreak: false });
      doc.text(num(itbis), X_ITBIS, y + 4, { width: W_ITBIS - 4, align: 'right', lineBreak: false });
      doc.text(num(l.total), X_VALUE, y + 4, { width: W_VALUE - 4, align: 'right', lineBreak: false });
      y += h;
      doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(BORDER_GRAY).lineWidth(0.4).stroke();
    });

    // ── Totales ─────────────────────────────────────────────────────────────
    const gravado = invoice.lines.filter((l) => l.itbisRate > 0).reduce((s, l) => s + l.total, 0);
    const exento = invoice.lines.filter((l) => l.itbisRate === 0).reduce((s, l) => s + l.total, 0);
    const filasTotales: Array<[string, number]> = [];
    if (gravado > 0) filasTotales.push(['Subtotal Gravado', gravado]);
    if (exento > 0) filasTotales.push(['Subtotal Exento', exento]);
    if (invoice.itbis > 0) filasTotales.push(['Total ITBIS', invoice.itbis]);
    filasTotales.push(['Monto Total', invoice.total]);

    if (y + 20 + filasTotales.length * 18 > ROWS_BOTTOM) {
      doc.addPage();
      y = cabeceraTabla(encabezado());
    }
    y += 12;
    const lx = LEFT + 240;
    const lw = 130;
    for (const [etiqueta, valor] of filasTotales) {
      const total = etiqueta === 'Monto Total';
      doc.rect(lx, y - 2, RIGHT - lx, 17).fill(total ? '#e5e7eb' : '#f3f4f6');
      doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(9).text(`${etiqueta}:`, lx + 4, y + 2, { width: lw, align: 'right', lineBreak: false });
      doc.font(total ? 'Helvetica-Bold' : 'Helvetica').text(formatRD(valor), lx + lw + 8, y + 2, { width: RIGHT - lx - lw - 12, align: 'right', lineBreak: false });
      y += 19;
    }

    // ── Notas ───────────────────────────────────────────────────────────────
    if (invoice.notes) {
      y += 8;
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(8);
      const nh = textHeight(doc, invoice.notes, WIDTH);
      if (y + nh <= QR_RESERVE_TOP) doc.text(invoice.notes, LEFT, y, { width: WIDTH, height: QR_RESERVE_TOP - y, ellipsis: true });
      y += nh;
    }

    // ── Código QR, código de seguridad y fecha de firma (abajo a la izquierda) ───
    if (qr) {
      if (y > QR_RESERVE_TOP) {
        doc.addPage();
        encabezado();
      }
      doc.image(qr, QR_X, QR_Y, { fit: [QR_SIZE, QR_SIZE] });
      let qy = QR_Y + QR_SIZE + 2;
      doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(8.5);
      if (invoice.ecfCodigoSeguridad) {
        doc.text('Código de Seguridad: ', QR_X, qy, { width: 300, continued: true });
        doc.font('Helvetica').text(invoice.ecfCodigoSeguridad);
        qy += 11;
      }
      if (info.fechaFirma) {
        doc.font('Helvetica-Bold').text('Fecha de Firma Digital: ', QR_X, qy, { width: 300, continued: true });
        doc.font('Helvetica').text(info.fechaFirma);
      }
      if (invoice.ecfEstado === 'rejected') {
        doc.fillColor('#b91c1c').font('Helvetica-Bold').fontSize(8);
        textLine(doc, 'Comprobante rechazado por la DGII: no sirve para sustentar crédito fiscal.', 250, QR_Y + 30, RIGHT - 250);
      }
    }

    // ── Numeración de páginas (solo si hay más de una) ───────────────────────
    const { count } = doc.bufferedPageRange();
    if (count > 1) {
      for (let i = 0; i < count; i++) {
        doc.switchToPage(i);
        doc.fillColor(MID_GRAY).font('Helvetica').fontSize(8);
        doc.text(`Página ${i + 1} de ${count}`, LEFT, PAGE_H - 28, { width: WIDTH, align: 'right', lineBreak: false });
      }
    }

    doc.switchToPage(count - 1);
    drawDigitalSignature(doc, invoice.number ?? invoice.id, invoice.createdBy && `${invoice.createdBy.firstName} ${invoice.createdBy.lastName}`);

    doc.end();
  });
}
