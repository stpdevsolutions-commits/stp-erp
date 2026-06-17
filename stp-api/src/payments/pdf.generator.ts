import { createWriteStream } from 'fs';
import PDFDocument from 'pdfkit';
import type { Payment } from './entities/payment.entity';
import { PaymentMethod, PaymentStatus } from './entities/payment.entity';
import { findLogoPath } from '../common/logo.utils';
import {
  drawDocumentHeader, CONTENT_Y,
  DARK_BLUE, TEAL, MID_GRAY, DARK_TEXT, BORDER_GRAY, LEFT, RIGHT, WIDTH,
} from '../common/pdf.header';
import type { CompanyData } from '../common/company';

const INFO_BG = '#f8fafc';

function money(n: number): string {
  const [int, dec] = (Math.round(n * 100) / 100).toFixed(2).split('.');
  return 'RD$ ' + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec;
}

const MONTHS_ES = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre',
];

function dateLong(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d as string);
  if (isNaN(dt.getTime())) return '—';
  return `${dt.getUTCDate()} de ${MONTHS_ES[dt.getUTCMonth()]}, ${dt.getUTCFullYear()}`;
}

function dateFmt(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]:     'Efectivo',
  [PaymentMethod.TRANSFER]: 'Transferencia',
  [PaymentMethod.CHECK]:    'Cheque',
  [PaymentMethod.CARD]:     'Tarjeta',
  [PaymentMethod.OTHER]:    'Otro',
};

const STATUS_LABELS: Record<PaymentStatus, string> = {
  [PaymentStatus.PENDING]:   'Pendiente',
  [PaymentStatus.COMPLETED]: 'Completado',
  [PaymentStatus.FAILED]:    'Fallido',
  [PaymentStatus.REFUNDED]:  'Reembolsado',
};

export function generatePaymentPdf(payment: Payment, outputPath: string, company: CompanyData): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: 'A4', autoFirstPage: true });
    const stream = createWriteStream(outputPath);
    doc.pipe(stream);
    stream.on('error', reject);

    const payDate = payment.date ? new Date(payment.date) : null;
    const docNumber = payDate
      ? `PAGO  ·  ${String(payDate.getUTCDate()).padStart(2,'0')}/${String(payDate.getUTCMonth()+1).padStart(2,'0')}/${payDate.getUTCFullYear()}`
      : 'RECIBO';

    drawDocumentHeader(doc, 'RECIBO\nDE PAGO', docNumber, findLogoPath(), company);
    let y = CONTENT_Y;

    // ── Info block ─────────────────────────────────────────────────────────
    const COL1 = LEFT + 14;
    const COL2 = LEFT + 268;

    const hasProject = !!payment.project;
    const hasQuote   = !!payment.quote;
    // 3 fixed rows + optional 4th when both project and quote are present
    const BLOCK_H = hasProject && hasQuote ? 142 : 110;

    doc.rect(LEFT, y, WIDTH, BLOCK_H).fill(INFO_BG);
    doc.rect(LEFT, y, 4,     BLOCK_H).fill(TEAL);

    // Row 1: CLIENTE / PROYECTO
    const r1Y = y + 10;
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7)
      .text('CLIENTE', COL1, r1Y, { lineBreak: false });
    doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(10.5)
      .text(payment.client?.name ?? '—', COL1, r1Y + 11, { width: 222, lineBreak: false });

    if (hasProject) {
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7)
        .text('PROYECTO', COL2, r1Y, { lineBreak: false });
      doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(10.5)
        .text(`${payment.project!.code} — ${payment.project!.name}`, COL2, r1Y + 11, { width: 222, lineBreak: false });
    } else if (hasQuote) {
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7)
        .text('COTIZACIÓN', COL2, r1Y, { lineBreak: false });
      doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(10.5)
        .text(payment.quote!.number ?? '—', COL2, r1Y + 11, { width: 222, lineBreak: false });
    }

    // Divider
    const div1Y = y + 38;
    doc.moveTo(COL1, div1Y).lineTo(RIGHT - 14, div1Y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();

    // Row 2: DESCRIPCIÓN / MÉTODO DE PAGO
    const r2Y = div1Y + 8;
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7)
      .text('DESCRIPCIÓN',     COL1, r2Y, { lineBreak: false })
      .text('MÉTODO DE PAGO',  COL2, r2Y, { lineBreak: false });
    doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9.5)
      .text(payment.description ?? '—', COL1, r2Y + 11, { width: 222, lineBreak: false });
    doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9.5)
      .text(METHOD_LABELS[payment.method] ?? payment.method, COL2, r2Y + 11, { width: 222, lineBreak: false });

    // Divider
    const div2Y = y + 68;
    doc.moveTo(COL1, div2Y).lineTo(RIGHT - 14, div2Y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();

    // Row 3: FECHA / ESTADO
    const r3Y = div2Y + 8;
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7)
      .text('FECHA',  COL1, r3Y, { lineBreak: false })
      .text('ESTADO', COL2, r3Y, { lineBreak: false });
    doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(9.5)
      .text(dateLong(payment.date), COL1, r3Y + 11, { width: 222, lineBreak: false });
    doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9.5)
      .text(STATUS_LABELS[payment.status] ?? payment.status, COL2, r3Y + 11, { width: 222, lineBreak: false });

    // Extra row: COTIZACIÓN if we have both project and quote
    if (hasProject && hasQuote) {
      const div3Y = y + 100;
      doc.moveTo(COL1, div3Y).lineTo(RIGHT - 14, div3Y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
      const r4Y = div3Y + 8;
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7)
        .text('COTIZACIÓN', COL1, r4Y, { lineBreak: false });
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9.5)
        .text(payment.quote!.number ?? '—', COL1, r4Y + 11, { width: 222, lineBreak: false });
    }

    y += BLOCK_H + 18;

    // ── Reference ──────────────────────────────────────────────────────────
    if (payment.reference) {
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(8.5)
        .text('Referencia:', LEFT, y, { lineBreak: false });
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9)
        .text(payment.reference, LEFT + 70, y, { lineBreak: false });
      y += 16;
    }

    // ── Notes ──────────────────────────────────────────────────────────────
    if (payment.notes) {
      doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(9).text('NOTAS', LEFT, y);
      y += 13;
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9)
        .text(payment.notes, LEFT, y, { width: WIDTH });
      y += doc.heightOfString(payment.notes, { width: WIDTH }) + 16;
    }

    // ── Amount ─────────────────────────────────────────────────────────────
    const tLabelX = LEFT + 310;
    const tLabelW = 120;
    const tValueX = LEFT + 430;
    const tValueW = RIGHT - (LEFT + 430);

    doc.moveTo(tLabelX, y).lineTo(RIGHT, y).strokeColor(TEAL).lineWidth(0.8).stroke();
    y += 7;

    doc.fillColor(MID_GRAY).font('Helvetica-Bold').fontSize(9.5)
      .text('MONTO RECIBIDO', tLabelX, y, { width: tLabelW, lineBreak: false });
    doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(13)
      .text(money(payment.amount), tValueX, y - 2, { width: tValueW, align: 'right', lineBreak: false });
    y += 22;

    // ── Footer ─────────────────────────────────────────────────────────────
    y += 20;
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(BORDER_GRAY).lineWidth(0.5).stroke();
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7)
      .text(
        `Documento generado el ${dateFmt(new Date())}  ·  ${company.name}  ·  RNC: ${company.rnc}  ·  ${company.email}`,
        LEFT, y + 7, { width: WIDTH, align: 'center', lineBreak: false },
      );

    doc.end();
    stream.on('finish', resolve);
  });
}
