import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import {
  createWorkbook,
  addReportSheet,
  type ReportColumn,
  type ReportCellType,
} from '../common/excel-report';
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
import type { ExportCell, ExportDoc, ExportTable } from './report-tables';

/**
 * Rinde un `ExportDoc` a Excel y a PDF. Ambos formatos parten de las mismas
 * tablas (`report-tables.ts`), así que dicen lo mismo por construcción.
 */

// ── Excel ─────────────────────────────────────────────────────────────────────

/** Los tipos de celda del doc son un subconjunto de los que ya entiende el Excel. */
const A_EXCEL: Record<string, ReportCellType> = {
  text: 'text',
  money: 'money',
  int: 'int',
  percent: 'percent',
  date: 'text',
};

export function docToWorkbook(doc: ExportDoc): ExcelJS.Workbook {
  const workbook = createWorkbook();

  for (const table of doc.tables) {
    const columns: ReportColumn<ExportCell[]>[] = table.columns.map((col, i) => ({
      header: col.header,
      value: (row) => row[i] ?? null,
      type: A_EXCEL[col.type ?? 'text'] ?? 'text',
      total: col.total,
    }));

    addReportSheet<ExportCell[]>(workbook, {
      // Excel corta los nombres de pestaña en 31 caracteres y no admite algunos
      // signos; se recorta aquí para no generar un archivo que Excel repare al abrir.
      sheetName: table.name.replace(/[\\/*?:[\]]/g, '').slice(0, 31),
      title: `${doc.title} — ${table.title}`,
      filters: doc.filters,
      columns,
      rows: table.rows,
      noTotals: !table.totals,
    });
  }

  return workbook;
}

// ── PDF ───────────────────────────────────────────────────────────────────────

const PAGE_BOTTOM = 780;
const ROW_H = 18;

function money(n: number): string {
  const [int, dec] = (Math.round((n ?? 0) * 100) / 100).toFixed(2).split('.');
  return 'RD$ ' + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec;
}

function fmt(value: ExportCell, type?: string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'money') return money(Number(value));
  if (type === 'int') return String(Math.round(Number(value)));
  if (type === 'percent') return `${Number(value)}%`;
  return String(value);
}

function dateFmt(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Anchos de columna: la primera (siempre el concepto) se lleva el espacio
 * sobrante y las numéricas van fijas y estrechas, que es como se leen mejor.
 */
function columnWidths(table: ExportTable): number[] {
  const n = table.columns.length;
  if (n === 1) return [WIDTH];
  const numericas = table.columns.slice(1).map((c) => (c.type === 'money' ? 110 : 80));
  const usado = numericas.reduce((a, b) => a + b, 0);
  return [Math.max(120, WIDTH - usado), ...numericas];
}

export function docToPdf(doc: ExportDoc, company: CompanyData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ margin: 0, size: 'A4', autoFirstPage: true });
    const chunks: Buffer[] = [];
    pdf.on('data', (c: Buffer) => chunks.push(c));
    pdf.on('error', reject);
    pdf.on('end', () => resolve(Buffer.concat(chunks)));

    const subtitulo = doc.filters.map((f) => `${f.label}: ${f.value}`).join('  ·  ');
    drawDocumentHeader(pdf, 'REPORTE', dateFmt(new Date()), findLogoPath(), company);

    let y = CONTENT_Y;

    pdf.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(14).text(doc.title, LEFT, y, {
      width: WIDTH,
    });
    y += 20;

    if (subtitulo) {
      pdf.fillColor(MID_GRAY).font('Helvetica').fontSize(9).text(subtitulo, LEFT, y, {
        width: WIDTH,
      });
      y += pdf.heightOfString(subtitulo, { width: WIDTH }) + 8;
    }

    const nuevaPagina = () => {
      pdf.addPage();
      y = 60;
    };

    for (const table of doc.tables) {
      const widths = columnWidths(table);

      // Un título de tabla solo al final de la página deja huérfana su cabecera.
      if (y + ROW_H * 3 > PAGE_BOTTOM) nuevaPagina();

      y += 8;
      pdf.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(10.5).text(table.title, LEFT, y, {
        width: WIDTH,
        lineBreak: false,
      });
      y += 16;

      const dibujarCabecera = () => {
        pdf.rect(LEFT, y - 3, WIDTH, ROW_H).fill('#f1f5f9');
        let x = LEFT;
        table.columns.forEach((col, i) => {
          const alineado = col.type && col.type !== 'text' && col.type !== 'date' ? 'right' : 'left';
          pdf
            .fillColor(DARK_TEXT)
            .font('Helvetica-Bold')
            .fontSize(8.5)
            .text(col.header, x + 4, y + 2, { width: widths[i] - 8, align: alineado, lineBreak: false });
          x += widths[i];
        });
        y += ROW_H;
      };

      dibujarCabecera();

      if (table.rows.length === 0) {
        pdf
          .fillColor(MID_GRAY)
          .font('Helvetica-Oblique')
          .fontSize(9)
          .text(table.vacio ?? 'Sin datos', LEFT + 4, y + 3, { width: WIDTH - 8, lineBreak: false });
        y += ROW_H + 6;
        continue;
      }

      for (const row of table.rows) {
        if (y + ROW_H > PAGE_BOTTOM) {
          nuevaPagina();
          dibujarCabecera();
        }
        let x = LEFT;
        table.columns.forEach((col, i) => {
          const alineado = col.type && col.type !== 'text' && col.type !== 'date' ? 'right' : 'left';
          pdf
            .fillColor(DARK_TEXT)
            .font('Helvetica')
            .fontSize(9)
            .text(fmt(row[i], col.type), x + 4, y + 3, {
              width: widths[i] - 8,
              align: alineado,
              lineBreak: false,
              ellipsis: true,
            });
          x += widths[i];
        });
        pdf
          .moveTo(LEFT, y + ROW_H - 2)
          .lineTo(RIGHT, y + ROW_H - 2)
          .strokeColor(BORDER_GRAY)
          .lineWidth(0.4)
          .stroke();
        y += ROW_H;
      }

      // ── Totales ────────────────────────────────────────────────────────────
      if (table.totals && table.columns.some((c) => c.total)) {
        if (y + ROW_H > PAGE_BOTTOM) nuevaPagina();
        let x = LEFT;
        pdf.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(TEAL).lineWidth(0.8).stroke();
        table.columns.forEach((col, i) => {
          const texto = col.total
            ? fmt(
                table.rows.reduce((acc, r) => acc + Number(r[i] ?? 0), 0),
                col.type,
              )
            : i === 0
              ? 'TOTAL'
              : '';
          const alineado = col.type && col.type !== 'text' && col.type !== 'date' ? 'right' : 'left';
          pdf
            .fillColor(i === 0 ? MID_GRAY : DARK_TEXT)
            .font('Helvetica-Bold')
            .fontSize(9)
            .text(texto, x + 4, y + 5, { width: widths[i] - 8, align: alineado, lineBreak: false });
          x += widths[i];
        });
        y += ROW_H + 6;
      }

      y += 10;
    }

    // ── Pie ────────────────────────────────────────────────────────────────
    pdf
      .moveTo(LEFT, PAGE_BOTTOM)
      .lineTo(RIGHT, PAGE_BOTTOM)
      .strokeColor(BORDER_GRAY)
      .lineWidth(0.5)
      .stroke();
    pdf
      .fillColor(MID_GRAY)
      .font('Helvetica')
      .fontSize(7)
      .text(
        `Generado el ${dateFmt(new Date())}  ·  ${company.name}  ·  RNC: ${company.rnc}  ·  ${company.email}`,
        LEFT,
        PAGE_BOTTOM + 7,
        { width: WIDTH, align: 'center', lineBreak: false },
      );

    pdf.end();
  });
}
