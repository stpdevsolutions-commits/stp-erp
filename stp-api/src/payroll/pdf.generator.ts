import PDFDocument from 'pdfkit';
import type { PayrollEntry } from './entities/payroll-entry.entity';
import { PayrollMethod, PayrollStatus } from './entities/payroll-entry.entity';
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
} from '../common/pdf.header';
import type { CompanyData } from '../common/company';

const INFO_BG = '#f8fafc';

function money(n: number): string {
  const [int, dec] = (Math.round((n ?? 0) * 100) / 100).toFixed(2).split('.');
  return 'RD$ ' + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec;
}

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function dateLong(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d as string);
  if (isNaN(dt.getTime())) return '—';
  return `${dt.getUTCDate()} de ${MONTHS_ES[dt.getUTCMonth()]}, ${dt.getUTCFullYear()}`;
}

function dateShort(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d as string);
  if (isNaN(dt.getTime())) return '—';
  return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`;
}

function dateFmt(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

const METHOD_LABELS: Record<PayrollMethod, string> = {
  [PayrollMethod.CASH]: 'Efectivo',
  [PayrollMethod.TRANSFER]: 'Transferencia',
  [PayrollMethod.CHECK]: 'Cheque',
  [PayrollMethod.OTHER]: 'Otro',
};

const STATUS_LABELS: Record<PayrollStatus, string> = {
  [PayrollStatus.PENDING]: 'Pendiente',
  [PayrollStatus.PAID]: 'Pagado',
  [PayrollStatus.CANCELLED]: 'Anulado',
};

/**
 * Recibo de pago de nómina, para imprimir y firmar.
 *
 * El desglose (bruto, deducciones, neto) va completo a propósito: el recibo lo
 * firma quien cobra, y firmar un papel que solo trae el neto deja al colaborador
 * sin forma de comprobar cómo se llegó a esa cifra.
 *
 * Se devuelve como Buffer en vez de escribirse a disco: un recibo se imprime en
 * el momento y no hay razón para guardar una copia por cada vez que alguien pulse
 * imprimir. Si el pago cambia, el recibo se regenera con los datos de entonces.
 */
export function generatePayrollReceiptPdf(
  entry: PayrollEntry,
  company: CompanyData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: 'A4', autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const colaborador = entry.collaborator;
    const nombre = colaborador
      ? `${colaborador.firstName} ${colaborador.lastName}`.trim()
      : '—';

    drawDocumentHeader(doc, 'RECIBO\nDE PAGO', entry.number, findLogoPath(), company);
    let y = CONTENT_Y;

    // ── Datos del beneficiario y del período ───────────────────────────────
    const COL1 = LEFT + 14;
    const COL2 = LEFT + 268;
    const BLOCK_H = 110;

    doc.rect(LEFT, y, WIDTH, BLOCK_H).fill(INFO_BG);
    doc.rect(LEFT, y, 4, BLOCK_H).fill(TEAL);

    const r1Y = y + 10;
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7)
      .text('BENEFICIARIO', COL1, r1Y, { lineBreak: false })
      .text('CÉDULA', COL2, r1Y, { lineBreak: false });
    doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(10.5)
      .text(nombre, COL1, r1Y + 11, { width: 222, lineBreak: false });
    doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(10.5)
      .text(colaborador?.cedula || '—', COL2, r1Y + 11, { width: 222, lineBreak: false });

    const div1Y = y + 38;
    doc.moveTo(COL1, div1Y).lineTo(RIGHT - 14, div1Y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();

    const r2Y = div1Y + 8;
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7)
      .text('PERÍODO', COL1, r2Y, { lineBreak: false })
      .text('POSICIÓN', COL2, r2Y, { lineBreak: false });
    doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9.5)
      .text(`${dateShort(entry.periodStart)} — ${dateShort(entry.periodEnd)}`, COL1, r2Y + 11, {
        width: 222,
        lineBreak: false,
      });
    doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9.5)
      .text(colaborador?.position || '—', COL2, r2Y + 11, { width: 222, lineBreak: false });

    const div2Y = y + 68;
    doc.moveTo(COL1, div2Y).lineTo(RIGHT - 14, div2Y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();

    const r3Y = div2Y + 8;
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7)
      .text('FECHA DE PAGO', COL1, r3Y, { lineBreak: false })
      .text('MÉTODO / ESTADO', COL2, r3Y, { lineBreak: false });
    doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(9.5)
      .text(dateLong(entry.paymentDate), COL1, r3Y + 11, { width: 222, lineBreak: false });
    doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9.5)
      .text(
        `${METHOD_LABELS[entry.method] ?? entry.method} · ${STATUS_LABELS[entry.status] ?? entry.status}`,
        COL2,
        r3Y + 11,
        { width: 222, lineBreak: false },
      );

    y += BLOCK_H + 20;

    if (entry.project) {
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(8.5)
        .text('Proyecto:', LEFT, y, { lineBreak: false });
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9)
        .text(`${entry.project.code} — ${entry.project.name}`, LEFT + 60, y, {
          width: WIDTH - 60,
          lineBreak: false,
        });
      y += 20;
    }

    // ── Desglose ───────────────────────────────────────────────────────────
    doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(9).text('DESGLOSE', LEFT, y);
    y += 14;

    doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(BORDER_GRAY).lineWidth(0.5).stroke();
    y += 8;

    const VALUE_X = RIGHT - 150;
    const VALUE_W = 150;

    const linea = (label: string, valor: string, negrita = false) => {
      doc.fillColor(DARK_TEXT).font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5)
        .text(label, LEFT, y, { width: 300, lineBreak: false });
      doc.fillColor(DARK_TEXT).font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5)
        .text(valor, VALUE_X, y, { width: VALUE_W, align: 'right', lineBreak: false });
      y += 16;
    };

    const dias = entry.daysWorked ?? 0;
    const tarifa = entry.dailyRate ?? 0;
    linea(`Días trabajados (${dias} × ${money(tarifa)})`, money(dias * tarifa));
    if (entry.overtimeAmount) linea('Horas extras', money(entry.overtimeAmount));
    if (entry.bonuses) linea('Bonificaciones', money(entry.bonuses));

    y += 2;
    doc.moveTo(VALUE_X - 60, y).lineTo(RIGHT, y).strokeColor(BORDER_GRAY).lineWidth(0.5).stroke();
    y += 8;
    linea('Total bruto', money(entry.grossAmount), true);

    if (entry.deductions) linea('Deducciones', `− ${money(entry.deductions)}`);
    if (entry.deductions && entry.discountReason) {
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(8)
        .text(`Motivo: ${entry.discountReason}`, LEFT, y, { width: 320, lineBreak: false });
      y += 12;
    }
    if (entry.retentionAmount)
      linea(
        `Retención (${entry.retentionPercent}%)`,
        `− ${money(entry.retentionAmount)}`,
      );

    y += 4;
    doc.moveTo(VALUE_X - 60, y).lineTo(RIGHT, y).strokeColor(TEAL).lineWidth(0.8).stroke();
    y += 8;

    doc.fillColor(MID_GRAY).font('Helvetica-Bold').fontSize(9.5)
      .text('NETO PAGADO', LEFT, y, { width: 300, lineBreak: false });
    doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(13)
      .text(money(entry.netAmount), VALUE_X, y - 2, { width: VALUE_W, align: 'right', lineBreak: false });
    y += 26;

    if (entry.reference) {
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(8.5)
        .text('Referencia:', LEFT, y, { lineBreak: false });
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9)
        .text(entry.reference, LEFT + 70, y, { lineBreak: false });
      y += 16;
    }

    if (entry.notes) {
      doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(9).text('NOTAS', LEFT, y);
      y += 13;
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9)
        .text(entry.notes, LEFT, y, { width: WIDTH });
      y += doc.heightOfString(entry.notes, { width: WIDTH }) + 10;
    }

    // ── Conformidad y firmas ───────────────────────────────────────────────
    // Lo que da valor al papel: la declaración va ANTES de las rayas, para que
    // quien firma esté firmando una frase concreta y no un espacio en blanco.
    y = Math.max(y + 16, 620);

    doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9)
      .text(
        `Recibí de ${company.name} la suma de ${money(entry.netAmount)} por concepto de pago de ` +
          `nómina correspondiente al período del ${dateShort(entry.periodStart)} al ` +
          `${dateShort(entry.periodEnd)}, quedando conforme y sin nada que reclamar por este concepto.`,
        LEFT,
        y,
        { width: WIDTH, align: 'justify' },
      );

    y += doc.heightOfString(
      `Recibí de ${company.name} la suma de ${money(entry.netAmount)} por concepto de pago de ` +
        `nómina correspondiente al período del ${dateShort(entry.periodStart)} al ` +
        `${dateShort(entry.periodEnd)}, quedando conforme y sin nada que reclamar por este concepto.`,
      { width: WIDTH },
    ) + 46;

    const SIGN_W = 210;
    const RIGHT_SIGN_X = RIGHT - SIGN_W;

    doc.moveTo(LEFT, y).lineTo(LEFT + SIGN_W, y).strokeColor(DARK_TEXT).lineWidth(0.7).stroke();
    doc.moveTo(RIGHT_SIGN_X, y).lineTo(RIGHT, y).strokeColor(DARK_TEXT).lineWidth(0.7).stroke();
    y += 6;

    doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(8.5)
      .text('RECIBIDO CONFORME', LEFT, y, { width: SIGN_W, align: 'center', lineBreak: false })
      .text('ENTREGADO POR', RIGHT_SIGN_X, y, { width: SIGN_W, align: 'center', lineBreak: false });
    y += 12;

    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(8)
      .text(nombre, LEFT, y, { width: SIGN_W, align: 'center', lineBreak: false })
      .text(company.name, RIGHT_SIGN_X, y, { width: SIGN_W, align: 'center', lineBreak: false });
    y += 11;

    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(8)
      .text(`Cédula: ${colaborador?.cedula || '________________'}`, LEFT, y, {
        width: SIGN_W,
        align: 'center',
        lineBreak: false,
      })
      .text(`Fecha: ____ / ____ / ______`, RIGHT_SIGN_X, y, {
        width: SIGN_W,
        align: 'center',
        lineBreak: false,
      });

    // ── Pie ────────────────────────────────────────────────────────────────
    const footerY = 780;
    doc.moveTo(LEFT, footerY).lineTo(RIGHT, footerY).strokeColor(BORDER_GRAY).lineWidth(0.5).stroke();
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7)
      .text(
        `Recibo ${entry.number}  ·  generado el ${dateFmt(new Date())}  ·  ${company.name}  ·  RNC: ${company.rnc}`,
        LEFT,
        footerY + 7,
        { width: WIDTH, align: 'center', lineBreak: false },
      );

    doc.end();
  });
}
