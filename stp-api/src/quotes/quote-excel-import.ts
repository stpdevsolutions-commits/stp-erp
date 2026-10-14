import * as ExcelJS from 'exceljs';

/** Una partida leída del Excel del proveedor, lista para convertirse en nodo del árbol de la cotización. */
export interface ImportedNode {
  kind: 'group' | 'item';
  description: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  discountPct?: number;
  children?: ImportedNode[];
}

export interface ImportResult {
  sheet: string;
  /** Fila (1-based) donde se encontró la cabecera. */
  headerRow: number;
  /** Qué columna del Excel se tomó para cada dato. */
  columns: Record<string, string>;
  nodes: ImportedNode[];
  itemCount: number;
  groupCount: number;
  /** Filas que no se importaron y por qué (totales, impuestos, filas incompletas). */
  skipped: { row: number; text: string; reason: string }[];
  warnings: string[];
}

export const IMPORT_MAX_ROWS = 2000;

type Field = 'description' | 'quantity' | 'unit' | 'unitPrice' | 'total' | 'discountPct';

const HEADERS: Record<Field, RegExp> = {
  description: /^(descripci[oó]n|partida|concepto|detalle|actividad|trabajo|rengl[oó]n|art[ií]culo)/i,
  quantity: /^(cant\.?|cantidad|qty|metraje)/i,
  unit: /^(unidad|und\.?|ud\.?|u\/m|um|medida|unit)/i,
  unitPrice: /^(precio\s*(unitario|unit\.?|u\.?)|p\.?\s*u\.?$|unitario|costo\s*unit|precio$|valor\s*unit|p\/u)/i,
  total: /^(total|importe|valor|monto|subtotal|sub-total)/i,
  discountPct: /^(desc\.?|descuento|dto\.?)\s*(%|porc\w*)?\s*$/i,
};

/** Filas que son resumen del documento (no partidas): se ignoran. */
const SUMMARY_ROW =
  /^(sub-?\s?total|total( general| rd\$?)?|itbis|i\.t\.b\.i\.s|impuestos?|imprevistos?|direcci[oó]n t[eé]cnica|gastos generales|supervisi[oó]n|descuento|neto|gran total|total a pagar|son:?)(\s|$|:|\d|%)/i;

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v && v.result !== undefined) return cellText(v.result as ExcelJS.CellValue);
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('text' in v) return String((v as { text: unknown }).text ?? '');
    return '';
  }
  return String(v).trim();
}

/** "1,250.50", "RD$ 1.250,50", "12%" → número; vacío o texto → null. */
export function toNumber(v: ExcelJS.CellValue): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v && typeof v === 'object' && !(v instanceof Date) && 'result' in v) return toNumber(v.result as ExcelJS.CellValue);
  const raw = cellText(v).replace(/RD\$|\$|%|\s/gi, '');
  if (!raw || !/\d/.test(raw) || /[a-z]/i.test(raw)) return null;
  let s = raw;
  if (s.includes(',') && s.includes('.')) {
    // El último separador es el decimal.
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

function findHeader(ws: ExcelJS.Worksheet): { row: number; map: Partial<Record<Field, number>> } | null {
  const limit = Math.min(ws.rowCount, 30);
  for (let r = 1; r <= limit; r++) {
    const map: Partial<Record<Field, number>> = {};
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
      const t = cellText(cell.value).replace(/\s+/g, ' ');
      if (!t || t.length > 40) return;
      // Lo más específico primero, para que "Precio unitario" no se lea como "Total".
      for (const field of ['discountPct', 'unitPrice', 'quantity', 'unit', 'description', 'total'] as Field[]) {
        if (map[field] === undefined && HEADERS[field].test(t)) {
          map[field] = col;
          break;
        }
      }
    });
    if (map.description !== undefined && (map.unitPrice !== undefined || map.total !== undefined)) return { row: r, map };
  }
  return null;
}

/**
 * Lee una cotización externa en Excel y la convierte en partidas. Heurística pensada para los formatos
 * típicos de presupuestos: una fila de cabecera (Descripción / Cant. / Und. / Precio / Total), filas
 * de sección sin cantidad ni precio (pasan a ser grupos) y filas de resumen al final (se ignoran).
 */
export async function parseQuoteExcel(buffer: Buffer): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new Error('No pude abrir el archivo. Debe ser un Excel .xlsx (si es .xls, guárdalo como .xlsx).');
  }

  let found: { ws: ExcelJS.Worksheet; row: number; map: Partial<Record<Field, number>> } | null = null;
  for (const ws of wb.worksheets) {
    const h = findHeader(ws);
    if (h && (!found || ws.rowCount > found.ws.rowCount)) found = { ws, ...h };
  }
  if (!found) {
    throw new Error(
      'No encontré la fila de títulos. Debe haber una fila con "Descripción" y "Precio" o "Total" (y de preferencia "Cantidad" y "Unidad").',
    );
  }
  const { ws, row: headerRow, map } = found;
  if (ws.rowCount - headerRow > IMPORT_MAX_ROWS) throw new Error(`El archivo tiene demasiadas filas (máximo ${IMPORT_MAX_ROWS}).`);

  const colName = (c?: number) => (c ? cellText(ws.getRow(headerRow).getCell(c).value) : '');
  const columns: Record<string, string> = {};
  for (const f of Object.keys(map) as Field[]) columns[f] = colName(map[f]);

  const skipped: ImportResult['skipped'] = [];
  const warnings: string[] = [];
  const nodes: ImportedNode[] = [];
  let group: ImportedNode | null = null;
  let itemCount = 0;

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (f: Field): ExcelJS.CellValue => (map[f] ? row.getCell(map[f]!).value : null);
    const description = cellText(get('description')).replace(/\s+/g, ' ');
    if (!description) continue;

    const qty = toNumber(get('quantity'));
    let price = toNumber(get('unitPrice'));
    const total = toNumber(get('total'));
    const unit = cellText(get('unit')) || undefined;
    const disc = toNumber(get('discountPct'));

    if (SUMMARY_ROW.test(description)) {
      skipped.push({ row: r, text: description, reason: 'Fila de resumen (la cotización recalcula sus totales)' });
      continue;
    }

    const hasAmount = (price ?? 0) > 0 || (total ?? 0) > 0 || (qty ?? 0) > 0;
    if (!hasAmount) {
      // Título de sección: agrupa las líneas que siguen.
      group = { kind: 'group', description, children: [] };
      nodes.push(group);
      continue;
    }

    let quantity = qty && qty > 0 ? qty : null;
    if (price === null || price <= 0) {
      if (total && total > 0) price = quantity ? total / quantity : total;
    }
    if (!quantity) quantity = 1;
    if (price === null || price < 0) {
      skipped.push({ row: r, text: description, reason: 'Sin precio ni total' });
      continue;
    }

    const item: ImportedNode = {
      kind: 'item',
      description,
      quantity: round2(quantity),
      unit,
      unitPrice: round2(price),
      ...(disc && disc > 0 && disc <= 100 ? { discountPct: round2(disc) } : {}),
    };
    // Si el Excel trae cantidad × precio ≠ total, se avisa: el que manda es cantidad × precio.
    if (total && qty && price && Math.abs(qty * price * (1 - (item.discountPct ?? 0) / 100) - total) > Math.max(1, total * 0.01)) {
      warnings.push(`Fila ${r} (${description.slice(0, 40)}): cantidad × precio no coincide con el total del Excel (${total}).`);
    }
    (group ? group.children! : nodes).push(item);
    itemCount++;
  }

  // Un título sin líneas no es una partida: se descarta.
  const clean = nodes.filter((n) => n.kind === 'item' || (n.children && n.children.length > 0));
  for (const n of nodes) {
    if (n.kind === 'group' && !(n.children && n.children.length > 0)) {
      skipped.push({ row: 0, text: n.description, reason: 'Título sin líneas debajo' });
    }
  }
  if (itemCount === 0) throw new Error('No encontré partidas con cantidad o precio debajo de la fila de títulos.');

  return {
    sheet: ws.name,
    headerRow,
    columns,
    nodes: clean,
    itemCount,
    groupCount: clean.filter((n) => n.kind === 'group').length,
    skipped: skipped.slice(0, 50),
    warnings: warnings.slice(0, 20),
  };
}
