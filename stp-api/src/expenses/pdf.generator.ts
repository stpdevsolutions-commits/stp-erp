import { createWriteStream } from 'fs';
import PDFDocument from 'pdfkit';
import type { Expense } from './entities/expense.entity';
import { ExpenseCategory } from './entities/expense.entity';
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

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  [ExpenseCategory.MATERIALS]:   'Materiales',
  [ExpenseCategory.LABOR]:       'Mano de obra',
  [ExpenseCategory.EQUIPMENT]:   'Equipos',
  [ExpenseCategory.SUBCONTRACT]: 'Subcontrato',
  [ExpenseCategory.TRAVEL]:      'Viáticos',
  [ExpenseCategory.OTHER]:       'Otros',
};

export function generateExpensePdf(expense: Expense, outputPath: string, company: CompanyData): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: 'A4', autoFirstPage: true });
    const stream = createWriteStream(outputPath);
    doc.pipe(stream);
    stream.on('error', reject);

    const expDate = expense.date ? new Date(expense.date) : null;
    const docNumber = expDate
      ? `GASTO  ·  ${String(expDate.getUTCDate()).padStart(2,'0')}/${String(expDate.getUTCMonth()+1).padStart(2,'0')}/${expDate.getUTCFullYear()}`
      : 'COMPROBANTE';

    drawDocumentHeader(doc, 'COMPROBANTE\nDE GASTO', docNumber, findLogoPath(), company);
    let y = CONTENT_Y;

    // ── Info block ─────────────────────────────────────────────────────────
    const COL1 = LEFT + 14;
    const COL2 = LEFT + 268;
    const BLOCK_H = 112;

    doc.rect(LEFT, y, WIDTH, BLOCK_H).fill(INFO_BG);
    doc.rect(LEFT, y, 4,     BLOCK_H).fill(TEAL);

    // Row 1: PROYECTO / CLIENTE
    const r1Y = y + 10;
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7)
      .text('PROYECTO', COL1, r1Y, { lineBreak: false });

    if (expense.project) {
      doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(10.5)
        .text(`${expense.project.code} — ${expense.project.name}`, COL1, r1Y + 11, { width: 222, lineBreak: false });
    }

    if (expense.project?.client) {
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7)
        .text('CLIENTE', COL2, r1Y, { lineBreak: false });
      doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(10.5)
        .text(expense.project.client.name ?? '—', COL2, r1Y + 11, { width: 222, lineBreak: false });
    }

    // Divider
    const div1Y = y + 38;
    doc.moveTo(COL1, div1Y).lineTo(RIGHT - 14, div1Y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();

    // Row 2: CATEGORÍA / PROVEEDOR
    const r2Y = div1Y + 8;
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7)
      .text('CATEGORÍA', COL1, r2Y, { lineBreak: false })
      .text('PROVEEDOR', COL2, r2Y, { lineBreak: false });
    doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9.5)
      .text(CATEGORY_LABELS[expense.category] ?? expense.category, COL1, r2Y + 11, { width: 222, lineBreak: false })
      .text(expense.supplier?.name ?? '—', COL2, r2Y + 11, { width: 222, lineBreak: false });

    // Divider
    const div2Y = y + 68;
    doc.moveTo(COL1, div2Y).lineTo(RIGHT - 14, div2Y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();

    // Row 3: DESCRIPCIÓN / FECHA
    const r3Y = div2Y + 8;
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7)
      .text('DESCRIPCIÓN', COL1, r3Y, { lineBreak: false })
      .text('FECHA',       COL2, r3Y, { lineBreak: false });
    doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9.5)
      .text(expense.description ?? '—', COL1, r3Y + 11, { width: 222, lineBreak: false });
    doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(9.5)
      .text(dateLong(expense.date), COL2, r3Y + 11, { width: 222, lineBreak: false });

    y += BLOCK_H + 18;

    // ── Notes ──────────────────────────────────────────────────────────────
    if (expense.notes) {
      doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(9).text('NOTAS', LEFT, y);
      y += 13;
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9)
        .text(expense.notes, LEFT, y, { width: WIDTH });
      y += doc.heightOfString(expense.notes, { width: WIDTH }) + 16;
    }

    // ── Amount ─────────────────────────────────────────────────────────────
    const tLabelX = LEFT + 310;
    const tLabelW = 120;
    const tValueX = LEFT + 430;
    const tValueW = RIGHT - (LEFT + 430);

    doc.moveTo(tLabelX, y).lineTo(RIGHT, y).strokeColor(TEAL).lineWidth(0.8).stroke();
    y += 7;

    doc.fillColor(MID_GRAY).font('Helvetica-Bold').fontSize(9.5)
      .text('MONTO TOTAL', tLabelX, y, { width: tLabelW, lineBreak: false });
    doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(13)
      .text(money(expense.amount), tValueX, y - 2, { width: tValueW, align: 'right', lineBreak: false });
    y += 22;

    // ── Footer ─────────────────────────────────────────────────────────────
    y += 16;
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
