import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { SalesInvoice } from './entities/sales-invoice.entity';
import { SalesInvoiceKind, SalesInvoiceStatus } from './entities/sales-invoice.entity';
import { findLogoPath } from '../common/logo.utils';
import {
  drawDocumentHeader,
  CONTENT_Y,
  DARK_BLUE,
  TEAL,
  MID_GRAY,
  DARK_TEXT,
  BORDER_GRAY,
  LEFT,
  RIGHT,
  WIDTH,
  textLine,
  textHeight,
} from '../common/pdf.header';
import type { CompanyData } from '../common/company';
import { formatDateRD } from '../common/dates';

/** 'YYYY-MM-DD' → 'dd/mm/aaaa' (sin pasar por Date: no hay desfase de zona). */
const ymd = (d: string) => d.slice(0, 10).split('-').reverse().join('/');
import { formatRD } from '../common/money';

const INFO_BG = '#f8fafc';
const PAGE_BOTTOM = 770;

// Columnas de la tabla de líneas.
const COL_DESC = LEFT + 8;
const W_DESC = 238;
const COL_QTY = LEFT + 252;
const W_QTY = 40;
const COL_PRICE = LEFT + 296;
const W_PRICE = 70;
const COL_ITBIS = LEFT + 370;
const W_ITBIS = 38;
const COL_TOTAL = LEFT + 412;
const W_TOTAL = WIDTH - 412 - 8;

function ecfLabel(tipo: string | null): string {
  const n = tipo?.match(/e-CF_(\d+)/)?.[1];
  if (n === '31') return 'Factura de crédito fiscal electrónica (e-CF 31)';
  if (n === '32') return 'Factura de consumo electrónica (e-CF 32)';
  if (n === '34') return 'Nota de crédito electrónica (e-CF 34)';
  return 'Comprobante fiscal electrónico';
}

/**
 * PDF de una factura de venta (representación impresa). Va al vuelo, sin guardarse:
 * lo que cambia (estado del e-CF, cobros) no deja un archivo viejo atrás. Un borrador
 * sale marcado "BORRADOR" y sin e-NCF.
 */
export async function generateSalesInvoicePdf(invoice: SalesInvoice, company: CompanyData): Promise<Buffer> {
  // Código QR del comprobante (el mismo enlace de consulta de la DGII). Se genera antes de
  // abrir el documento porque la librería es asíncrona y el dibujo del PDF no lo es.
  const qr = invoice.ecfQrUrl
    ? await QRCode.toBuffer(invoice.ecfQrUrl, { margin: 1, width: 220, errorCorrectionLevel: 'M' })
    : null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: 'A4', autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const issued = invoice.status === SalesInvoiceStatus.ISSUED;
    const docNumber = issued && invoice.ecfEncf ? `e-NCF ${invoice.ecfEncf}` : invoice.number;
    const isCreditNote = invoice.kind === SalesInvoiceKind.CREDIT_NOTE;
    const title = isCreditNote ? 'NOTA DE\nCRÉDITO' : issued ? 'FACTURA' : 'FACTURA\nBORRADOR';
    drawDocumentHeader(doc, title, docNumber, findLogoPath(), company);
    let y = CONTENT_Y;

    // ── Datos del cliente y de la factura ───────────────────────────────────
    const COL1 = LEFT + 14;
    const COL2 = LEFT + 268;
    const COL_W = 222;
    const clientName = invoice.client?.name ?? '—';
    const projectText = invoice.project ? `${invoice.project.code} — ${invoice.project.name}` : '—';

    doc.font('Helvetica-Bold').fontSize(10.5);
    const clientH = Math.max(textHeight(doc, clientName, COL_W), textHeight(doc, projectText, COL_W));
    const BLOCK_H = 10 + 11 + clientH + 8 + 8 + 11 + doc.currentLineHeight() + 10;

    doc.rect(LEFT, y, WIDTH, BLOCK_H).fill(INFO_BG);
    doc.rect(LEFT, y, 4, BLOCK_H).fill(TEAL);

    let ry = y + 10;
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7);
    doc.text('CLIENTE', COL1, ry, { lineBreak: false });
    doc.text('PROYECTO', COL2, ry, { lineBreak: false });
    doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(10.5);
    doc.text(clientName, COL1, ry + 11, { width: COL_W });
    doc.text(projectText, COL2, ry + 11, { width: COL_W });
    ry += 11 + clientH + 8;
    doc.moveTo(LEFT + 14, ry).lineTo(RIGHT - 14, ry).strokeColor(BORDER_GRAY).lineWidth(0.5).stroke();
    ry += 8;
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7);
    doc.text('RNC / CÉDULA DEL CLIENTE', COL1, ry, { lineBreak: false });
    doc.text('FECHA' + (invoice.dueDate ? '  ·  LÍMITE DE COBRO' : ''), COL2, ry, { lineBreak: false });
    doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(10.5);
    textLine(doc, invoice.client?.rnc || 'Consumidor final', COL1, ry + 11, COL_W);
    textLine(
      doc,
      ymd(invoice.issueDate) + (invoice.dueDate ? `  ·  ${ymd(invoice.dueDate)}` : ''),
      COL2,
      ry + 11,
      COL_W,
    );
    y += BLOCK_H + 18;

    if (isCreditNote && invoice.relatedInvoice) {
      doc.rect(LEFT, y - 6, WIDTH, 30).fill('#fff7ed');
      doc.rect(LEFT, y - 6, 4, 30).fill('#ea580c');
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7);
      textLine(doc, 'MODIFICA LA FACTURA', LEFT + 14, y, WIDTH - 28);
      doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(9);
      textLine(
        doc,
        `${invoice.relatedInvoice.ecfEncf ?? invoice.relatedInvoice.number}  ·  ${invoice.modificationCode === 1 ? 'Anula la factura' : 'Corrige montos'}${invoice.reason ? `  ·  ${invoice.reason}` : ''}`,
        LEFT + 14,
        y + 11,
        WIDTH - 28,
      );
      y += 40;
    }

    // ── Tabla de líneas ─────────────────────────────────────────────────────
    const header = () => {
      doc.rect(LEFT, y, WIDTH, 20).fill(DARK_BLUE);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
      doc.text('DESCRIPCIÓN', COL_DESC, y + 6, { lineBreak: false });
      doc.text('CANT.', COL_QTY, y + 6, { width: W_QTY, align: 'right', lineBreak: false });
      doc.text('PRECIO', COL_PRICE, y + 6, { width: W_PRICE, align: 'right', lineBreak: false });
      doc.text('ITBIS', COL_ITBIS, y + 6, { width: W_ITBIS, align: 'right', lineBreak: false });
      doc.text('IMPORTE', COL_TOTAL, y + 6, { width: W_TOTAL, align: 'right', lineBreak: false });
      y += 20;
    };
    header();

    doc.font('Helvetica').fontSize(9);
    invoice.lines.forEach((l, i) => {
      doc.font('Helvetica').fontSize(9);
      const h = Math.max(textHeight(doc, l.description, W_DESC), doc.currentLineHeight()) + 10;
      if (y + h > PAGE_BOTTOM) {
        doc.addPage();
        y = 40;
        header();
      }
      if (i % 2 === 1) doc.rect(LEFT, y, WIDTH, h).fill(INFO_BG);
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9);
      doc.text(l.description, COL_DESC, y + 5, { width: W_DESC });
      doc.text(String(l.quantity), COL_QTY, y + 5, { width: W_QTY, align: 'right', lineBreak: false });
      doc.text(formatRD(l.unitPrice).replace('RD$ ', ''), COL_PRICE, y + 5, { width: W_PRICE, align: 'right', lineBreak: false });
      doc.text(l.itbisRate > 0 ? `${l.itbisRate}%` : 'Exento', COL_ITBIS, y + 5, { width: W_ITBIS, align: 'right', lineBreak: false });
      doc.text(formatRD(l.total).replace('RD$ ', ''), COL_TOTAL, y + 5, { width: W_TOTAL, align: 'right', lineBreak: false });
      y += h;
      doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(BORDER_GRAY).lineWidth(0.4).stroke();
    });

    // ── Totales ─────────────────────────────────────────────────────────────
    if (y + 120 > PAGE_BOTTOM) {
      doc.addPage();
      y = 40;
    }
    y += 12;
    const labelX = LEFT + 250;
    const labelW = 90;
    const valX = labelX + labelW;
    const valW = RIGHT - valX;
    const totalRow = (label: string, value: string, big = false) => {
      doc.fillColor(MID_GRAY).font('Helvetica-Bold').fontSize(big ? 10 : 9);
      doc.text(label, labelX, y + (big ? 3 : 0), { width: labelW, lineBreak: false });
      doc.fillColor(big ? TEAL : DARK_TEXT).font('Helvetica-Bold').fontSize(big ? 14 : 9.5);
      doc.text(value, valX, y, { width: valW, align: 'right', lineBreak: false });
      y += big ? 22 : 16;
    };
    totalRow('Subtotal', formatRD(invoice.subtotal));
    totalRow('ITBIS', formatRD(invoice.itbis));
    doc.moveTo(labelX, y).lineTo(RIGHT, y).strokeColor(TEAL).lineWidth(0.8).stroke();
    y += 6;
    totalRow('TOTAL', formatRD(invoice.total), true);
    if (issued) {
      const paid = invoice.paidAmount ?? 0;
      if (paid > 0) {
        totalRow('Cobrado', formatRD(paid));
        totalRow('Saldo', formatRD(invoice.balance ?? invoice.total - paid));
      }
    }

    // ── Notas ───────────────────────────────────────────────────────────────
    if (invoice.notes) {
      y += 8;
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(8);
      const nh = textHeight(doc, invoice.notes, WIDTH);
      doc.text(invoice.notes, LEFT, y, { width: WIDTH });
      y += nh;
    }

    // ── Comprobante fiscal electrónico ──────────────────────────────────────
    if (issued && invoice.ecfEncf) {
      const blockH = qr ? 96 : 46;
      if (y + blockH + 24 > PAGE_BOTTOM) {
        doc.addPage();
        y = 40;
      }
      y += 16;
      const textW = qr ? WIDTH - 28 - 92 : WIDTH - 28;
      doc.rect(LEFT, y, WIDTH, blockH).fill(INFO_BG);
      doc.rect(LEFT, y, 4, blockH).fill(TEAL);
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7);
      textLine(doc, ecfLabel(invoice.ecfTipo).toUpperCase(), LEFT + 14, y + 8, textW);
      doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(9.5);
      textLine(doc, `e-NCF ${invoice.ecfEncf}`, LEFT + 14, y + 20, textW);
      if (invoice.ecfCodigoSeguridad) {
        doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7.5);
        textLine(doc, 'Código de seguridad', LEFT + 14, y + 36, textW);
        doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(9.5);
        textLine(doc, invoice.ecfCodigoSeguridad, LEFT + 14, y + 46, textW);
      }
      if (invoice.ecfQrUrl) {
        doc.fillColor(MID_GRAY).font('Helvetica').fontSize(6.5);
        doc.text(`Consulta en la DGII: ${invoice.ecfQrUrl}`, LEFT + 14, y + 62, { width: textW, height: 28, ellipsis: true });
      }
      if (qr) doc.image(qr, RIGHT - 84, y + 8, { fit: [80, 80] });
      y += blockH;
    }

    // ── Pie ─────────────────────────────────────────────────────────────────
    y = Math.min(Math.max(y + 24, 740), 800);
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(BORDER_GRAY).lineWidth(0.5).stroke();
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7).text(
      `Documento generado el ${formatDateRD()}  ·  ${company.name}  ·  RNC: ${company.rnc}  ·  ${company.email}`,
      LEFT,
      y + 7,
      { width: WIDTH, align: 'center', lineBreak: false },
    );

    doc.end();
  });
}
