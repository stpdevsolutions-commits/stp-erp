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
import type { ExportCell, ExportColumn, ExportDoc, ExportTable } from './report-tables';

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

/**
 * Las fuentes estándar de PDFKit (Helvetica) escriben en WinAnsi, que NO tiene
 * el menos matemático «−» (U+2212) ni las comillas y guiones que mete cualquier
 * editor de texto: salían como un carácter suelto sin sentido («cobros " gastos»).
 * El texto de los informes lo redacta una persona y puede traer cualquiera de
 * estos, así que se normalizan aquí, en el único punto por el que pasa TODO lo
 * que se dibuja. El guion largo «—» y el punto medio «·» sí están en WinAnsi y
 * se dejan tal cual.
 */
const NO_WINANSI: [RegExp, string][] = [
  [/−/g, '-'], // menos matemático
  [/[‐‑]/g, '-'], // guiones tipográficos
  [/[‘’‛]/g, "'"], // comillas simples curvas
  [/[“”‟]/g, '"'], // comillas dobles curvas
  [/…/g, '...'],
  [/[≤]/g, '<='],
  [/[≥]/g, '>='],
  [/ /g, ' '], // espacio duro
];

export function textoPdf(valor: unknown): string {
  let s = String(valor ?? '');
  for (const [re, rep] of NO_WINANSI) s = s.replace(re, rep);
  return s;
}

function fmt(value: ExportCell, type?: string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'money') return money(Number(value));
  if (type === 'int') return String(Math.round(Number(value)));
  if (type === 'percent') return `${Number(value)}%`;
  return textoPdf(value);
}

/** Alto de una línea de texto dentro de una celda o de un párrafo. */
const LINE_H = 11;

/**
 * Parte un texto en las líneas que caben en `ancho`, midiendo con la fuente que
 * esté activa (hay que fijarla ANTES de llamar).
 *
 * No vale contar caracteres: «MMMM» y «llll» ocupan muy distinto. Y hay que
 * respetar los saltos de línea que escriba el usuario, que PDFKit dibuja aunque
 * se le pase `lineBreak: false` — de ahí venía que una descripción larga se
 * montara sobre la fila siguiente.
 */
function envolver(pdf: PDFKit.PDFDocument, texto: string, ancho: number): string[] {
  const lineas: string[] = [];

  for (const parrafo of String(texto ?? '').split(/\r?\n/)) {
    if (parrafo.trim() === '') {
      lineas.push('');
      continue;
    }
    let actual = '';
    for (const palabra of parrafo.trim().split(/\s+/)) {
      const prueba = actual === '' ? palabra : `${actual} ${palabra}`;
      if (pdf.widthOfString(prueba) <= ancho) {
        actual = prueba;
        continue;
      }
      if (actual !== '') lineas.push(actual);
      actual = palabra;
      // Una palabra sola más ancha que la columna (un correo, una URL) se trocea
      // por donde quepa; si no, se saldría de la celda.
      while (pdf.widthOfString(actual) > ancho && actual.length > 1) {
        let corte = actual.length;
        while (corte > 1 && pdf.widthOfString(actual.slice(0, corte)) > ancho) corte--;
        lineas.push(actual.slice(0, corte));
        actual = actual.slice(corte);
      }
    }
    if (actual !== '') lineas.push(actual);
  }

  return lineas.length ? lineas : [''];
}

function dateFmt(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Anchos de columna: el espacio sobrante se reparte entre las columnas de
 * TEXTO, y las de dato conocido (fecha, dinero, número) van fijas y estrechas.
 *
 * Antes se le daba todo el sobrante a la primera columna, dando por hecho que
 * era el concepto. En "Detalle de gastos" la primera es la fecha, así que se
 * llevaba 165 pt para escribir "2026-08-01" y dejaba la descripción en 80 pt,
 * donde cualquier texto real se partía en un montón de líneas.
 */
function columnWidths(table: ExportTable): number[] {
  const n = table.columns.length;
  if (n === 1) return [WIDTH];

  const fijo = (c: ExportColumn): number | null => {
    if (c.type === 'money') return 110;
    if (c.type === 'date') return 72;
    if (c.type === 'int' || c.type === 'percent') return 80;
    return null; // texto: reparte el resto
  };

  const base = table.columns.map(fijo);
  const nTexto = base.filter((a) => a === null).length;
  const usadoFijo = base.reduce<number>((s, a) => s + (a ?? 0), 0);

  // Sin columnas de texto, el sobrante va a la primera (suele ser el concepto).
  if (nTexto === 0) {
    const extra = Math.max(0, WIDTH - usadoFijo);
    return base.map((a, i) => (a ?? 0) + (i === 0 ? extra : 0));
  }

  // La primera columna de texto suele ser la descripción y es la que carga con
  // el contenido largo: se lleva doble ración que las demás.
  const pesos = base.map((a, i) => (a !== null ? 0 : i === base.findIndex((b) => b === null) ? 2 : 1));
  const totalPesos = pesos.reduce((a, b) => a + b, 0);
  const libre = Math.max(nTexto * 80, WIDTH - usadoFijo);
  const anchos = base.map((a, i) => a ?? (libre * pesos[i]) / totalPesos);

  // Si no cabe (muchas columnas), se escala todo para no salirse de la página.
  const total = anchos.reduce((a, b) => a + b, 0);
  return total > WIDTH ? anchos.map((a) => (a * WIDTH) / total) : anchos;
}

export function docToPdf(doc: ExportDoc, company: CompanyData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ margin: 0, size: 'A4', autoFirstPage: true });
    const chunks: Buffer[] = [];
    pdf.on('data', (c: Buffer) => chunks.push(c));
    pdf.on('error', reject);
    pdf.on('end', () => resolve(Buffer.concat(chunks)));

    const subtitulo = textoPdf(doc.filters.map((f) => `${f.label}: ${f.value}`).join('  ·  '));
    drawDocumentHeader(pdf, 'REPORTE', dateFmt(new Date()), findLogoPath(), company);

    let y = CONTENT_Y;

    // El título envuelve cuando es largo, así que hay que avanzar por su altura
    // real: con un `y += 20` fijo, un título de dos líneas se comía el subtítulo.
    // `heightOfString` mide con la fuente activa, por eso se fija antes.
    pdf.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(14);
    const tituloDoc = textoPdf(doc.title);
    const altoTitulo = pdf.heightOfString(tituloDoc, { width: WIDTH });
    pdf.text(tituloDoc, LEFT, y, { width: WIDTH });
    y += altoTitulo + 6;

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
      // Los títulos de sección los redacta el usuario y pueden ser largos: se
      // dejan envolver y se avanza por la altura real. Con `lineBreak: false`
      // se salían por el lado derecho de la página.
      pdf.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(10.5);
      const tituloTabla = textoPdf(table.title);
      const altoTituloTabla = pdf.heightOfString(tituloTabla, { width: WIDTH });
      pdf.text(tituloTabla, LEFT, y, { width: WIDTH });
      y += altoTituloTabla + 4;

      // Una cabecera larga («Var. vs período anterior») envuelve a dos líneas y
      // se salía por debajo de la banda gris, pisando la primera fila. La banda
      // crece con el encabezado más alto en vez de asumir una sola línea.
      pdf.font('Helvetica-Bold').fontSize(8.5);
      const altoCabecera = Math.max(
        ROW_H,
        ...table.columns.map(
          (col, i) => pdf.heightOfString(textoPdf(col.header), { width: widths[i] - 8 }) + 6,
        ),
      );

      // Un bloque redactado va como párrafo corrido: partirlo en filas de tabla
      // lo hacía leerse como un listado, con una raya entre cada renglón.
      if (table.texto) {
        pdf.fillColor(DARK_TEXT).font('Helvetica').fontSize(9.5);
        for (const linea of envolver(pdf, textoPdf(table.texto), WIDTH)) {
          if (y + LINE_H + 2 > PAGE_BOTTOM) nuevaPagina();
          if (linea !== '') {
            pdf
              .fillColor(DARK_TEXT)
              .font('Helvetica')
              .fontSize(9.5)
              .text(linea, LEFT, y, { width: WIDTH, lineBreak: false });
          }
          y += LINE_H + 2;
        }
        y += 8;
        continue;
      }

      const dibujarCabecera = () => {
        pdf.rect(LEFT, y - 3, WIDTH, altoCabecera).fill('#f1f5f9');
        let x = LEFT;
        table.columns.forEach((col, i) => {
          const alineado = col.type && col.type !== 'text' && col.type !== 'date' ? 'right' : 'left';
          pdf
            .fillColor(DARK_TEXT)
            .font('Helvetica-Bold')
            .fontSize(8.5)
            .text(textoPdf(col.header), x + 4, y + 2, { width: widths[i] - 8, align: alineado });
          x += widths[i];
        });
        y += altoCabecera;
      };

      dibujarCabecera();

      if (table.rows.length === 0) {
        pdf
          .fillColor(MID_GRAY)
          .font('Helvetica-Oblique')
          .fontSize(9)
          .text(textoPdf(table.vacio ?? 'Sin datos'), LEFT + 4, y + 3, { width: WIDTH - 8, lineBreak: false });
        y += ROW_H + 6;
        continue;
      }

      for (const row of table.rows) {
        // La fila crece con su celda más alta. Antes tenía altura fija y una
        // descripción larga se dibujaba encima de la fila siguiente.
        pdf.font('Helvetica').fontSize(9);
        const celdas = table.columns.map((col, i) =>
          envolver(pdf, fmt(row[i], col.type), widths[i] - 8),
        );
        const alto = Math.max(ROW_H, Math.max(...celdas.map((c) => c.length)) * LINE_H + 7);

        if (y + alto > PAGE_BOTTOM) {
          nuevaPagina();
          dibujarCabecera();
        }
        let x = LEFT;
        table.columns.forEach((col, i) => {
          const alineado = col.type && col.type !== 'text' && col.type !== 'date' ? 'right' : 'left';
          celdas[i].forEach((linea, j) => {
            pdf
              .fillColor(DARK_TEXT)
              .font('Helvetica')
              .fontSize(9)
              .text(linea, x + 4, y + 3 + j * LINE_H, {
                width: widths[i] - 8,
                align: alineado,
                lineBreak: false,
              });
          });
          x += widths[i];
        });
        pdf
          .moveTo(LEFT, y + alto - 2)
          .lineTo(RIGHT, y + alto - 2)
          .strokeColor(BORDER_GRAY)
          .lineWidth(0.4)
          .stroke();
        y += alto;
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
