import { createWriteStream } from 'fs';
import PDFDocument from 'pdfkit';
import type { Payment } from './entities/payment.entity';
import { PaymentMethod, PaymentStatus } from './entities/payment.entity';
import { findLogoPath } from '../common/logo.utils';
import {
  drawDocumentHeader, CONTENT_Y,
  DARK_BLUE, TEAL, MID_GRAY, DARK_TEXT, BORDER_GRAY, LEFT, RIGHT, WIDTH,
  textLine, textHeight,
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
    // Alturas de fila dinámicas: "proyecto" y "descripción" son texto libre y
    // pueden ocupar 2+ líneas (un nombre de proyecto largo, una descripción
    // completa). Con altura fija, esa segunda línea se montaba encima de la
    // fila siguiente — ver nota en textLine/textHeight (common/pdf.header.ts).
    const COL1 = LEFT + 14;
    const COL2 = LEFT + 268;
    const COL_W = 222;
    const LABEL_OFFSET = 11; // distancia de la etiqueta al valor
    const GAP_AFTER_VALUE = 8; // valor -> línea divisoria
    const GAP_AFTER_DIVIDER = 8; // línea divisoria -> siguiente etiqueta

    const hasProject = !!payment.project;
    const hasQuote = !!payment.quote;
    const clienteText = payment.client?.name ?? '—';
    const proyectoText = hasProject
      ? `${payment.project!.code} — ${payment.project!.name}`
      : hasQuote
        ? (payment.quote!.number ?? '—')
        : '';
    const descripcionText = payment.description ?? '—';
    const metodoText = METHOD_LABELS[payment.method] ?? payment.method;
    const fechaText = dateLong(payment.date);
    const estadoText = STATUS_LABELS[payment.status] ?? payment.status;

    // Medición: cambiar fuente/tamaño no dibuja nada, solo afecta a
    // heightOfString/currentLineHeight — se puede repetir en el dibujo real.
    doc.font('Helvetica-Bold').fontSize(10.5);
    const clienteH = doc.currentLineHeight();
    const proyectoH = hasProject || hasQuote ? textHeight(doc, proyectoText, COL_W) : clienteH;
    const row1H = Math.max(clienteH, proyectoH);

    doc.font('Helvetica').fontSize(9.5);
    const descripcionH = textHeight(doc, descripcionText, COL_W);
    const metodoH = doc.currentLineHeight();
    const row2H = Math.max(descripcionH, metodoH);
    const row3H = doc.currentLineHeight(); // fecha/estado, siempre una línea

    const extraRowH = hasProject && hasQuote ? doc.currentLineHeight() : 0;

    const rowFootprint = (h: number) => LABEL_OFFSET + h + GAP_AFTER_VALUE + GAP_AFTER_DIVIDER;
    const BLOCK_H =
      10 +
      rowFootprint(row1H) +
      rowFootprint(row2H) +
      (extraRowH > 0 ? rowFootprint(row3H) + LABEL_OFFSET + extraRowH : LABEL_OFFSET + row3H) +
      10;

    doc.rect(LEFT, y, WIDTH, BLOCK_H).fill(INFO_BG);
    doc.rect(LEFT, y, 4, BLOCK_H).fill(TEAL);

    // Row 1: CLIENTE / PROYECTO (o COTIZACIÓN si no hay proyecto)
    let rowY = y + 10;
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7).text('CLIENTE', COL1, rowY, { lineBreak: false });
    doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(10.5);
    textLine(doc, clienteText, COL1, rowY + LABEL_OFFSET, COL_W);

    if (hasProject) {
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7).text('PROYECTO', COL2, rowY, { lineBreak: false });
      doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(10.5)
        .text(proyectoText, COL2, rowY + LABEL_OFFSET, { width: COL_W });
    } else if (hasQuote) {
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7).text('COTIZACIÓN', COL2, rowY, { lineBreak: false });
      doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(10.5);
      textLine(doc, proyectoText, COL2, rowY + LABEL_OFFSET, COL_W);
    }

    rowY += rowFootprint(row1H) - GAP_AFTER_DIVIDER;
    doc.moveTo(COL1, rowY).lineTo(RIGHT - 14, rowY).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
    rowY += GAP_AFTER_DIVIDER;

    // Row 2: DESCRIPCIÓN / MÉTODO DE PAGO
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7)
      .text('DESCRIPCIÓN', COL1, rowY, { lineBreak: false })
      .text('MÉTODO DE PAGO', COL2, rowY, { lineBreak: false });
    doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9.5)
      .text(descripcionText, COL1, rowY + LABEL_OFFSET, { width: COL_W });
    doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9.5);
    textLine(doc, metodoText, COL2, rowY + LABEL_OFFSET, COL_W);

    rowY += rowFootprint(row2H) - GAP_AFTER_DIVIDER;
    doc.moveTo(COL1, rowY).lineTo(RIGHT - 14, rowY).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
    rowY += GAP_AFTER_DIVIDER;

    // Row 3: FECHA / ESTADO
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7)
      .text('FECHA', COL1, rowY, { lineBreak: false })
      .text('ESTADO', COL2, rowY, { lineBreak: false });
    doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(9.5);
    textLine(doc, fechaText, COL1, rowY + LABEL_OFFSET, COL_W);
    doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9.5);
    textLine(doc, estadoText, COL2, rowY + LABEL_OFFSET, COL_W);

    // Fila extra: COTIZACIÓN, solo cuando también hay proyecto (si no hay
    // proyecto, la cotización ya salió en la Fila 1 en su lugar).
    if (extraRowH > 0) {
      rowY += rowFootprint(row3H) - GAP_AFTER_DIVIDER;
      doc.moveTo(COL1, rowY).lineTo(RIGHT - 14, rowY).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
      rowY += GAP_AFTER_DIVIDER;
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7).text('COTIZACIÓN', COL1, rowY, { lineBreak: false });
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9.5);
      textLine(doc, payment.quote!.number ?? '—', COL1, rowY + LABEL_OFFSET, COL_W);
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
    // Es la cifra más importante del recibo: su propia franja a todo lo
    // ancho, con una caja de verdad para el valor (antes 80pt — no le
    // entraba "RD$ 150,000.00" a 13pt y se partía en dos líneas montadas).
    const amountLabelW = 200;
    const amountValueX = LEFT + amountLabelW;
    const amountValueW = RIGHT - amountValueX;

    doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(TEAL).lineWidth(0.8).stroke();
    y += 10;

    doc.fillColor(MID_GRAY).font('Helvetica-Bold').fontSize(10);
    textLine(doc, 'MONTO RECIBIDO', LEFT, y + 5, amountLabelW);
    doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(18)
      .text(money(payment.amount), amountValueX, y, { width: amountValueW, align: 'right' });
    y += Math.max(24, doc.currentLineHeight());

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
