import * as ExcelJS from 'exceljs';
import type { Response } from 'express';
import { COMPANY } from './company';

/**
 * Generador de reportes .xlsx con identidad STP.
 *
 * Reglas de diseño (ver también el módulo `reports`):
 * - Los montos se escriben como NÚMERO con formato de moneda RD$ (nunca texto),
 *   para que el usuario pueda sumar/filtrar en Excel.
 * - Las fechas se escriben como fecha real de Excel. `dateOnly()` construye la
 *   fecha en UTC (ExcelJS convierte el epoch a serial usando UTC, así que una
 *   fecha 'YYYY-MM-DD' a medianoche UTC cae en el día correcto sin desfase).
 * - Los timestamptz (sentAt, decidedAt...) se desplazan a hora de República
 *   Dominicana (UTC-4 todo el año, sin horario de verano) antes de escribirse.
 */

/** Navy corporativo STP (#0D3773) en formato ARGB de Excel. */
export const STP_NAVY = 'FF0D3773';
const STP_NAVY_SOFT = 'FFEDF1F8';
const BORDER_GRAY = 'FFD5DBE5';

/** Offset fijo de República Dominicana respecto a UTC (horas). */
const RD_UTC_OFFSET = -4;

export type ReportCellType =
  | 'text'
  | 'money'
  | 'number'
  | 'int'
  | 'date'
  | 'datetime'
  | 'percent';

export type ReportCellValue = string | number | Date | null;

export interface ReportColumn<T> {
  /** Rótulo de la cabecera (en español). */
  header: string;
  /** Extractor del valor de la fila. Devolver `null` deja la celda vacía. */
  value: (row: T) => ReportCellValue;
  /** Tipo de dato → determina formato numérico y alineación. Por defecto 'text'. */
  type?: ReportCellType;
  /** Ancho fijo en caracteres. Si se omite, se calcula a partir del contenido. */
  width?: number;
  /** Si es true, la columna se suma en la fila de totales. */
  total?: boolean;
}

export interface ReportFilter {
  label: string;
  value: string;
}

export interface ReportSheetOptions<T> {
  sheetName: string;
  title: string;
  filters?: ReportFilter[];
  columns: ReportColumn<T>[];
  rows: T[];
  /** Rótulo de la fila de totales (por defecto "TOTAL"). */
  totalsLabel?: string;
  /** Omitir la fila de totales (p. ej. hojas de detalle). */
  noTotals?: boolean;
}

const NUMBER_FORMATS: Record<ReportCellType, string | undefined> = {
  text: undefined,
  money: '"RD$"#,##0.00',
  number: '#,##0.00',
  int: '#,##0',
  date: 'dd/mm/yyyy',
  datetime: 'dd/mm/yyyy hh:mm',
  percent: '0.00"%"',
};

const RIGHT_ALIGNED: ReportCellType[] = ['money', 'number', 'int', 'percent'];
const CENTER_ALIGNED: ReportCellType[] = ['date', 'datetime'];

/** Fecha 'YYYY-MM-DD' (columna `date` de Postgres) → Date en UTC, sin desfase. */
export function dateOnly(value?: string | Date | null): Date | null {
  if (!value) return null;
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const [y, m, d] = raw.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

/** timestamptz → Date desplazado a hora local RD para que Excel lo muestre bien. */
export function localDateTime(value?: Date | string | null): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + RD_UTC_OFFSET * 3600 * 1000);
}

/**
 * timestamptz → fecha (sin hora) del día correspondiente en República Dominicana.
 * Útil para columnas tipo 'date' sobre campos que en la BD son timestamp.
 */
export function localDateOnly(value?: Date | string | null): Date | null {
  const shifted = localDateTime(value);
  if (!shifted) return null;
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()),
  );
}

/** Marca de generación legible, en hora de República Dominicana. */
export function generatedAtLabel(): string {
  return new Intl.DateTimeFormat('es-DO', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Santo_Domingo',
  }).format(new Date());
}

/** Longitud aproximada del texto que Excel mostrará en la celda. */
function displayLength(value: ReportCellValue, type: ReportCellType): number {
  if (value === null || value === undefined) return 0;
  if (value instanceof Date) return type === 'datetime' ? 16 : 10;
  if (typeof value === 'number') {
    const formatted = new Intl.NumberFormat('es-DO', {
      minimumFractionDigits: type === 'int' ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value);
    return formatted.length + (type === 'money' ? 4 : 0);
  }
  return String(value).length;
}

export function createWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY.name;
  wb.company = COMPANY.name;
  wb.created = new Date();
  return wb;
}

/**
 * Añade una hoja con cabecera de identidad STP, tabla formateada, autofiltro,
 * panel inmovilizado y fila de totales.
 */
export function addReportSheet<T>(
  workbook: ExcelJS.Workbook,
  options: ReportSheetOptions<T>,
): ExcelJS.Worksheet {
  const { sheetName, title, filters = [], columns, rows, totalsLabel = 'TOTAL' } = options;
  const lastCol = columns.length;

  const ws = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const mergeLine = (text: string, style: Partial<ExcelJS.Font>, height?: number) => {
    const row = ws.addRow([text]);
    if (lastCol > 1) ws.mergeCells(row.number, 1, row.number, lastCol);
    const cell = ws.getCell(row.number, 1);
    cell.font = style;
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    if (height) row.height = height;
    return row;
  };

  // ── Encabezado de identidad ────────────────────────────────────────────────
  mergeLine(COMPANY.name.toUpperCase(), { bold: true, size: 15, color: { argb: STP_NAVY } }, 22);
  mergeLine(`RNC ${COMPANY.rnc}  ·  ${COMPANY.phones}  ·  ${COMPANY.email}`, {
    size: 9,
    color: { argb: 'FF6B7280' },
  });
  mergeLine(`${COMPANY.address1}, ${COMPANY.address2}`, {
    size: 9,
    color: { argb: 'FF6B7280' },
  });
  ws.addRow([]);
  mergeLine(title, { bold: true, size: 13, color: { argb: 'FF111827' } }, 20);
  mergeLine(`Generado: ${generatedAtLabel()}`, { size: 9, italic: true, color: { argb: 'FF6B7280' } });
  const filterText = filters.length
    ? filters.map((f) => `${f.label}: ${f.value}`).join('   ·   ')
    : 'Sin filtros aplicados (todos los registros)';
  mergeLine(`Filtros — ${filterText}`, { size: 9, color: { argb: 'FF374151' } });
  mergeLine(`Registros: ${rows.length}`, { size: 9, color: { argb: 'FF374151' } });
  ws.addRow([]);

  // ── Cabecera de la tabla ───────────────────────────────────────────────────
  const headerRow = ws.addRow(columns.map((c) => c.header));
  headerRow.height = 20;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STP_NAVY } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: STP_NAVY } },
      bottom: { style: 'thin', color: { argb: STP_NAVY } },
      left: { style: 'thin', color: { argb: STP_NAVY } },
      right: { style: 'thin', color: { argb: STP_NAVY } },
    };
  });

  // ── Filas de datos ─────────────────────────────────────────────────────────
  const widths = columns.map((c) => Math.max(c.header.length, 8));
  const totals = columns.map(() => 0);

  rows.forEach((row, idx) => {
    const values = columns.map((c) => {
      const v = c.value(row);
      return v === null || v === undefined ? null : v;
    });
    const excelRow = ws.addRow(values);
    excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const col = columns[colNumber - 1];
      if (!col) return;
      const type = col.type ?? 'text';
      const fmt = NUMBER_FORMATS[type];
      if (fmt) cell.numFmt = fmt;
      cell.font = { size: 10 };
      cell.alignment = {
        vertical: 'middle',
        horizontal: RIGHT_ALIGNED.includes(type)
          ? 'right'
          : CENTER_ALIGNED.includes(type)
            ? 'center'
            : 'left',
        wrapText: false,
      };
      cell.border = { bottom: { style: 'hair', color: { argb: BORDER_GRAY } } };
      if (idx % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STP_NAVY_SOFT } };
      }
    });

    values.forEach((v, i) => {
      const type = columns[i].type ?? 'text';
      widths[i] = Math.max(widths[i], displayLength(v, type));
      if (columns[i].total && typeof v === 'number') totals[i] += v;
    });
  });

  // ── Fila de totales ────────────────────────────────────────────────────────
  const hasTotals = !options.noTotals && columns.some((c) => c.total);
  if (hasTotals) {
    const totalValues: ReportCellValue[] = columns.map((c, i) =>
      c.total ? parseFloat(totals[i].toFixed(2)) : null,
    );
    totalValues[0] = totalsLabel;
    const totalRow = ws.addRow(totalValues);
    totalRow.height = 18;
    totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const col = columns[colNumber - 1];
      if (!col) return;
      const type = col.type ?? 'text';
      if (col.total) {
        const fmt = NUMBER_FORMATS[type];
        if (fmt) cell.numFmt = fmt;
      }
      cell.font = { bold: true, size: 10, color: { argb: STP_NAVY } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: col.total ? 'right' : colNumber === 1 ? 'left' : 'left',
      };
      cell.border = { top: { style: 'medium', color: { argb: STP_NAVY } } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STP_NAVY_SOFT } };
    });
    totals.forEach((t, i) => {
      if (columns[i].total) {
        widths[i] = Math.max(widths[i], displayLength(t, columns[i].type ?? 'number'));
      }
    });
    widths[0] = Math.max(widths[0], totalsLabel.length);
  }

  // ── Anchos, autofiltro e inmovilización ────────────────────────────────────
  columns.forEach((c, i) => {
    const computed = c.width ?? Math.min(58, Math.max(10, widths[i] + 3));
    ws.getColumn(i + 1).width = computed;
  });

  const lastDataRow = ws.rowCount;
  if (rows.length > 0) {
    ws.autoFilter = {
      from: { row: headerRow.number, column: 1 },
      to: { row: hasTotals ? lastDataRow - 1 : lastDataRow, column: lastCol },
    };
  }
  ws.views = [
    {
      state: 'frozen',
      ySplit: headerRow.number,
      showGridLines: false,
    },
  ];

  return ws;
}

/** Escribe el workbook en la respuesta HTTP con las cabeceras correctas de xlsx. */
export async function sendWorkbook(
  res: Response,
  workbook: ExcelJS.Workbook,
  filenameBase: string,
): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `${filenameBase}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', String((buffer as ArrayBuffer).byteLength));
  res.end(Buffer.from(buffer as ArrayBuffer));
}
