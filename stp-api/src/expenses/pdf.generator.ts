import { createWriteStream } from 'fs';
import PDFDocument from 'pdfkit';
import type { Expense } from './entities/expense.entity';
import { ExpenseCategory } from './entities/expense.entity';
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
    // Alturas dinámicas: "proyecto" y "descripción" pueden ocupar 2+ líneas.
    // Con altura fija esa segunda línea se montaba sobre la fila siguiente —
    // ver nota en textLine/textHeight (common/pdf.header.ts).
    const COL1 = LEFT + 14;
    const COL2 = LEFT + 268;
    const COL_W = 222;
    const LABEL_OFFSET = 11;
    const GAP_AFTER_VALUE = 8;
    const GAP_AFTER_DIVIDER = 8;

    const proyectoText = expense.project ? `${expense.project.code} — ${expense.project.name}` : '';
    const clienteText = expense.project?.client?.name ?? '';
    const categoriaText = CATEGORY_LABELS[expense.category] ?? expense.category;
    const proveedorText = expense.supplier?.name ?? '—';
    const descripcionText = expense.description ?? '—';
    const fechaText = dateLong(expense.date);

    doc.font('Helvetica-Bold').fontSize(10.5);
    const proyectoH = expense.project ? textHeight(doc, proyectoText, COL_W) : doc.currentLineHeight();
    const clienteH = expense.project?.client ? textHeight(doc, clienteText, COL_W) : doc.currentLineHeight();
    const row1H = Math.max(proyectoH, clienteH);

    doc.font('Helvetica').fontSize(9.5);
    const row2H = doc.currentLineHeight(); // categoría/proveedor, siempre una línea
    const descripcionH = textHeight(doc, descripcionText, COL_W);
    const row3H = Math.max(descripcionH, doc.currentLineHeight());

    const rowFootprint = (h: number) => LABEL_OFFSET + h + GAP_AFTER_VALUE + GAP_AFTER_DIVIDER;
    const BLOCK_H = 10 + rowFootprint(row1H) + rowFootprint(row2H) + LABEL_OFFSET + row3H + 10;

    doc.rect(LEFT, y, WIDTH, BLOCK_H).fill(INFO_BG);
    doc.rect(LEFT, y, 4, BLOCK_H).fill(TEAL);

    // Row 1: PROYECTO / CLIENTE
    let rowY = y + 10;
    if (expense.project) {
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7).text('PROYECTO', COL1, rowY, { lineBreak: false });
      doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(10.5)
        .text(proyectoText, COL1, rowY + LABEL_OFFSET, { width: COL_W });
    }
    if (expense.project?.client) {
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7).text('CLIENTE', COL2, rowY, { lineBreak: false });
      doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(10.5)
        .text(clienteText, COL2, rowY + LABEL_OFFSET, { width: COL_W });
    }

    rowY += rowFootprint(row1H) - GAP_AFTER_DIVIDER;
    doc.moveTo(COL1, rowY).lineTo(RIGHT - 14, rowY).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
    rowY += GAP_AFTER_DIVIDER;

    // Row 2: CATEGORÍA / PROVEEDOR
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7)
      .text('CATEGORÍA', COL1, rowY, { lineBreak: false })
      .text('PROVEEDOR', COL2, rowY, { lineBreak: false });
    doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9.5);
    textLine(doc, categoriaText, COL1, rowY + LABEL_OFFSET, COL_W);
    doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9.5);
    textLine(doc, proveedorText, COL2, rowY + LABEL_OFFSET, COL_W);

    rowY += rowFootprint(row2H) - GAP_AFTER_DIVIDER;
    doc.moveTo(COL1, rowY).lineTo(RIGHT - 14, rowY).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
    rowY += GAP_AFTER_DIVIDER;

    // Row 3: DESCRIPCIÓN / FECHA
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7)
      .text('DESCRIPCIÓN', COL1, rowY, { lineBreak: false })
      .text('FECHA', COL2, rowY, { lineBreak: false });
    doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9.5)
      .text(descripcionText, COL1, rowY + LABEL_OFFSET, { width: COL_W });
    doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(9.5);
    textLine(doc, fechaText, COL2, rowY + LABEL_OFFSET, COL_W);

    y += BLOCK_H + 18;

    // ── Notes ──────────────────────────────────────────────────────────────
    if (expense.notes) {
      doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(9).text('NOTAS', LEFT, y);
      y += 13;
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9)
        .text(expense.notes, LEFT, y, { width: WIDTH });
      y += doc.heightOfString(expense.notes, { width: WIDTH }) + 16;
    }

    // ── Desglose cantidad × unitario (solo si el gasto lo trae) ────────────
    if (expense.quantity != null && expense.unitPrice != null) {
      const unitCode = expense.unit?.code ?? '';
      const qty = `${expense.quantity} ${unitCode}`.trim();
      const detail =
        `${qty} × ${money(expense.unitPrice)}` +
        (expense.itbisIncluded ? ' (ITBIS incluido)' : '') +
        (expense.material ? `  ·  ${expense.material.code} ${expense.material.name}` : '');

      doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(9).text('DESGLOSE', LEFT, y);
      y += 13;
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9).text(detail, LEFT, y, { width: WIDTH });
      y += doc.heightOfString(detail, { width: WIDTH }) + 16;
    }

    // ── Amount ─────────────────────────────────────────────────────────────
    const amountLabelW = 200;
    const amountValueX = LEFT + amountLabelW;
    const amountValueW = RIGHT - amountValueX;

    doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(TEAL).lineWidth(0.8).stroke();
    y += 10;

    doc.fillColor(MID_GRAY).font('Helvetica-Bold').fontSize(10);
    textLine(doc, 'MONTO TOTAL', LEFT, y + 5, amountLabelW);
    doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(18)
      .text(money(expense.amount), amountValueX, y, { width: amountValueW, align: 'right' });
    y += Math.max(24, doc.currentLineHeight());

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
