import { createWriteStream } from 'fs';
import PDFDocument from 'pdfkit';
import type { Payment } from './entities/payment.entity';
import { PaymentMethod, PaymentStatus } from './entities/payment.entity';
import { findLogoPath } from '../common/logo.utils';
import { drawDocumentHeader, CONTENT_Y } from '../common/pdf.header';

const DARK_BLUE = '#1a3c6e';
const MID_GRAY = '#6b7280';
const BORDER_GRAY = '#e5e7eb';
const DARK_TEXT = '#1f2937';
const LEFT = 50;
const RIGHT = 545;
const WIDTH = RIGHT - LEFT;

function money(n: number): string {
  const [int, dec] = (Math.round(n * 100) / 100).toFixed(2).split('.');
  return 'RD$ ' + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec;
}

function dateFmt(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d as string);
  if (isNaN(dt.getTime())) return '—';
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = dt.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: 'Efectivo',
  [PaymentMethod.TRANSFER]: 'Transferencia',
  [PaymentMethod.CHECK]: 'Cheque',
  [PaymentMethod.CARD]: 'Tarjeta',
  [PaymentMethod.OTHER]: 'Otro',
};

const STATUS_LABELS: Record<PaymentStatus, string> = {
  [PaymentStatus.PENDING]: 'Pendiente',
  [PaymentStatus.COMPLETED]: 'Completado',
  [PaymentStatus.FAILED]: 'Fallido',
  [PaymentStatus.REFUNDED]: 'Reembolsado',
};

export function generatePaymentPdf(payment: Payment, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: 'A4' });
    const stream = createWriteStream(outputPath);
    doc.pipe(stream);
    stream.on('error', reject);

    // ── Unified header ────────────────────────────────────────────────────────
    drawDocumentHeader(doc, 'RECIBO DE PAGO', `PAGO · ${dateFmt(payment.date)}`, findLogoPath());

    // ── Client + project + quote block ────────────────────────────────────────
    let y = CONTENT_Y;

    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7.5)
      .text('CLIENTE', LEFT, y, { lineBreak: false });
    y += 11;
    doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(11)
      .text(payment.client?.name ?? '—', LEFT, y, { width: 240, lineBreak: false });
    y += 14;

    const rcol = LEFT + 265;
    let ry = CONTENT_Y;

    const metaRight = (label: string, value: string) => {
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7.5)
        .text(label, rcol, ry, { width: 230, lineBreak: false });
      ry += 11;
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9)
        .text(value, rcol, ry, { width: 230, lineBreak: false });
      ry += 14;
    };

    if (payment.project) {
      metaRight('PROYECTO', `${payment.project.code} — ${payment.project.name}`);
    }
    if (payment.quote) {
      metaRight('COTIZACIÓN', payment.quote.number ?? '—');
    }

    y = Math.max(y, ry) + 10;

    // ── Divider ───────────────────────────────────────────────────────────────
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(BORDER_GRAY).lineWidth(1).stroke();
    y += 12;

    // ── Detail block ──────────────────────────────────────────────────────────
    const labelX = LEFT;
    const valueX = LEFT + 140;
    const valueW = WIDTH - 140;

    const detailRow = (label: string, value: string) => {
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(8.5)
        .text(label, labelX, y, { width: 130, lineBreak: false });
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9)
        .text(value, valueX, y, { width: valueW });
      const rowH = Math.max(doc.heightOfString(value, { width: valueW }), 12) + 8;
      y += rowH;
    };

    detailRow('Descripción', payment.description ?? '—');
    detailRow('Método de pago', METHOD_LABELS[payment.method] ?? payment.method);
    detailRow('Estado', STATUS_LABELS[payment.status] ?? payment.status);
    detailRow('Fecha', dateFmt(payment.date));
    detailRow('Referencia', payment.reference ?? '—');
    if (payment.notes) {
      detailRow('Notas', payment.notes);
    }

    y += 8;

    // ── Totals ────────────────────────────────────────────────────────────────
    const tLabelX = LEFT + 285;
    const tLabelW = 120;
    const tValueX = LEFT + 405;
    const tValueW = RIGHT - (LEFT + 405);

    doc.moveTo(tLabelX, y).lineTo(RIGHT, y).strokeColor(DARK_BLUE).lineWidth(0.5).stroke();
    y += 4;

    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(9)
      .text('MONTO RECIBIDO', tLabelX, y, { width: tLabelW, lineBreak: false });
    doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(10)
      .text(money(payment.amount), tValueX, y, { width: tValueW, align: 'right', lineBreak: false });

    // ── Footer ────────────────────────────────────────────────────────────────
    const footerY = 800;
    doc.moveTo(LEFT, footerY).lineTo(RIGHT, footerY).strokeColor(BORDER_GRAY).lineWidth(0.5).stroke();
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7.5)
      .text(
        'Soluciones Técnicas Profesionales STP  ·  RNC 132-94-3058  ·  Santo Domingo, Rep. Dom.  ·  stpsoluciones.com',
        LEFT, footerY + 8, { width: WIDTH, align: 'center', lineBreak: false },
      );

    doc.end();
    stream.on('finish', resolve);
  });
}
