/**
 * Lectura de facturas PDF por su capa de texto (ERP-52), SIN IA ni OCR.
 *
 * La mayoría de los PDF de proveedores (e-CF, facturas de sistemas contables) traen texto real:
 * ahí el NCF, el RNC y el total se sacan con expresiones regulares en milisegundos y gratis.
 * Solo se da por buena la lectura si trae como mínimo NCF válido + RNC + total coherente; si no,
 * `extractFromPdfText` devuelve null y el escáner cae a la IA como siempre.
 *
 * `parseInvoiceText` es lógica pura (se prueba con texto); `extractFromPdfText` solo le añade la
 * extracción del texto con `pdf-parse` (pdf.js), con tope de páginas, de caracteres y de tiempo.
 */
import { isValidNcf, isValidRnc, normalizeNcf, normalizeRnc, round2 } from './fiscal-invoice-rules';
import { RawScan, SCAN_MAX_BYTES, validIsoDate } from './invoice-scan';

const MAX_PAGES = 5;
const MAX_CHARS = 120_000;
const TIMEOUT_MS = 10_000;

export type FieldConfidence = 'high' | 'medium' | 'low';

export interface PdfTextFields {
  ncf: string;
  supplierRnc: string;
  supplierName: string | null;
  invoiceDate: string | null;
  baseAmount: number | null;
  itbis: number | null;
  totalAmount: number;
}

export interface PdfTextExtraction {
  /** Campos leídos del texto (el NCF, el RNC y el total siempre están: es el mínimo). */
  fields: PdfTextFields;
  /** Confianza por campo, para decidir qué tan fiable es cada dato. */
  confidence: Partial<Record<keyof PdfTextFields, FieldConfidence>>;
  /** Forma que consume `normalizeScan`, igual a la que devuelve la IA. */
  raw: RawScan;
}

/* ---------- utilidades ---------- */

/** "1,234.50" → 1234.5 ; también "1234.50" y "1.234,50" (separador europeo). */
export function parseAmount(s: string): number | null {
  let t = s.replace(/[^\d.,]/g, '');
  if (!t) return null;
  const lastDot = t.lastIndexOf('.');
  const lastComma = t.lastIndexOf(',');
  if (lastComma > lastDot) {
    // "1.234,50" o "12,50": la coma es el decimal solo si le siguen 1-2 dígitos.
    t = /,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else {
    t = t.replace(/,/g, '');
  }
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? round2(n) : null;
}

/** Dígito verificador del RNC de 9 dígitos (módulo 11). Solo sube la confianza; no descarta. */
export function rncChecksumOk(rnc: string): boolean {
  if (!/^\d{9}$/.test(rnc)) return false;
  const w = [7, 9, 8, 6, 5, 4, 3, 2];
  const sum = w.reduce((acc, wi, i) => acc + wi * Number(rnc[i]), 0);
  const r = sum % 11;
  const dv = r === 0 ? 2 : r === 1 ? 1 : 11 - r;
  return dv === Number(rnc[8]);
}

const MONTHS: Record<string, string> = {
  enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
  julio: '07', agosto: '08', septiembre: '09', setiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
  ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06', jul: '07', ago: '08',
  sep: '09', set: '09', oct: '10', nov: '11', dic: '12',
};

const pad = (n: string | number) => String(n).padStart(2, '0');

/** Fechas dominicanas dd/mm/aaaa (también con - o .), aaaa-mm-dd y "5 de octubre de 2026" → ISO. */
export function parseDate(s: string): string | null {
  let m = s.match(/(?<!\d)(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?!\d)/);
  if (m) return validIsoDate(`${m[1]}-${pad(m[2])}-${pad(m[3])}`);
  m = s.match(/(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return validIsoDate(`${year}-${pad(m[2])}-${pad(m[1])}`);
  }
  m = s.match(/(?<!\d)(\d{1,2})\s*(?:de\s+)?([a-záéíóú]{3,10})\.?\s*(?:de\s+|del\s+|,\s*)?(\d{4})(?!\d)/i);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()] ?? MONTHS[m[2].toLowerCase().slice(0, 3)];
    if (mon) return validIsoDate(`${m[3]}-${mon}-${pad(m[1])}`);
  }
  return null;
}

const AMOUNT = String.raw`(?:RD\s?\$|DOP|\$)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?![\d,])`;
const PCT = String.raw`(?:\(?\s*\d{1,2}(?:\.\d+)?\s*%\s*\)?)?`;

/** Primer monto que sigue a la etiqueta (o el último/mayor según `pick`). */
function labeled(
  text: string,
  label: string,
  pick: 'first' | 'max' = 'first',
  sameLine = false,
): number | null {
  // sameLine: etiqueta y monto en la misma línea (en tablas de columnas, un salto de línea separa cosas distintas).
  const sp = sameLine ? String.raw`[ \t]*` : String.raw`\s*`;
  const re = new RegExp(String.raw`${label}${sp}${PCT}${sp}[:=\-]?${sp}${AMOUNT}`, 'gi');
  const found: number[] = [];
  for (const m of text.matchAll(re)) {
    const n = parseAmount(m[1]);
    if (n !== null) found.push(n);
  }
  if (found.length === 0) return null;
  return pick === 'max' ? Math.max(...found) : found[0];
}

/* ---------- campos ---------- */

export function findNcf(text: string): { ncf: string; labeled: boolean } | null {
  const re = /(?<![A-Za-z0-9])([BE]\s?\d{2})[\s-]?(\d{8}|\d{10})(?!\d)/gi;
  let fallback: string | null = null;
  for (const m of text.matchAll(re)) {
    const ncf = normalizeNcf(`${m[1]}${m[2]}`);
    if (!isValidNcf(ncf)) continue;
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    // "NCF", "e-NCF", "Comprobante" cerca: es el de la factura, no uno afectado/de referencia.
    if (/(?:e-?\s?)?(?:ncf|comprobante)[^\n]{0,30}$/i.test(before) && !/(modifica|afectad|referencia)/i.test(before)) {
      return { ncf, labeled: true };
    }
    fallback ??= ncf;
  }
  return fallback ? { ncf: fallback, labeled: false } : null;
}

export function findSupplierRnc(text: string, ncf: string): { rnc: string; checksum: boolean } | null {
  const re = /(?:RNC|R\.N\.C\.?|c[eé]dula|RUC)(?:\s*\/\s*c[eé]dula)?\s*(?:emisor|proveedor)?\s*[:#.]?\s*(\d[\d\s-]{7,15}\d)/gi;
  const ncfDigits = ncf.slice(1);
  for (const m of text.matchAll(re)) {
    const before = text.slice(Math.max(0, m.index - 25), m.index);
    // El RNC del comprador no es el del emisor.
    if (/(compra|client|recept|adquirient|facturado\s+a|cliente)[^\n]{0,20}$/i.test(before)) continue;
    if (/(compra|client|adquirient|receptor)/i.test(m[0])) continue;
    const rnc = normalizeRnc(m[1]);
    if (!isValidRnc(rnc) || rnc === ncfDigits) continue;
    return { rnc, checksum: rncChecksumOk(rnc) };
  }
  return null;
}

export function findDate(text: string): { date: string; labeled: boolean } | null {
  const labels = /(?:fecha\s*(?:de\s*)?(?:emisi[oó]n|factura|comprobante|expedici[oó]n)?|date)\s*[:.]?\s*([^\n]{0,30})/gi;
  for (const m of text.matchAll(labels)) {
    const before = text.slice(Math.max(0, m.index - 12), m.index);
    if (/venc|firma|valid|hasta|entrega/i.test(`${before}${m[0].slice(0, 28)}`)) continue;
    const d = parseDate(m[1]);
    if (d) return { date: d, labeled: true };
  }
  const any = parseDate(text);
  return any ? { date: any, labeled: false } : null;
}

export function findTotal(text: string): { total: number; labeled: 'strong' | 'weak' | 'exempt' } | null {
  const strong = labeled(text, String.raw`(?:total\s+a\s+pagar|monto\s+total|total\s+general|total\s+factura|valor\s+total|importe\s+total|total\s+neto)`, 'max');
  if (strong !== null && strong > 0) return { total: strong, labeled: 'strong' };
  const weak = labeled(text, String.raw`(?<![a-záéíóú])total(?:[ \t]+(?:rd\$?|dop))?`, 'max', true);
  if (weak !== null && weak > 0) return { total: weak, labeled: 'weak' };
  // Factura toda exenta (sin ITBIS ni monto gravado): el monto exento es el total.
  if (!/itbis|gravado/i.test(text)) {
    const exempt = labeled(text, String.raw`(?:monto|total|valor)[ \t]+exento`, 'max', true);
    if (exempt !== null && exempt > 0) return { total: exempt, labeled: 'exempt' };
  }
  return null;
}

export function findSupplierName(text: string): string | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 12);
  const re = /(?:^|\s)(?:S\.?\s?R\.?\s?L\.?|S\.?\s?A\.?\s?S?\.?|E\.?\s?I\.?\s?R\.?\s?L\.?|SRL|SAS|EIRL)\s*$/i;
  const hit = lines.find((l) => l.length >= 5 && l.length <= 80 && re.test(l) && !/\d{6,}/.test(l));
  return hit ?? null;
}

/**
 * Interpreta el texto de una factura. Devuelve null si no hay como mínimo NCF válido + RNC +
 * total coherente (con ITBIS/subtotal si aparecen): en ese caso hay que usar la IA.
 */
export function parseInvoiceText(text: string): PdfTextExtraction | null {
  const ncfHit = findNcf(text);
  if (!ncfHit) return null;
  const rncHit = findSupplierRnc(text, ncfHit.ncf);
  if (!rncHit) return null;
  const totalHit = findTotal(text);
  if (!totalHit) return null;

  const itbis = labeled(text, String.raw`(?:total\s+)?itbis(?:\s+facturado)?`, 'first');
  const base = labeled(text, String.raw`(?:sub\s?-?\s?total|monto\s+gravado(?:\s+total)?|total\s+gravado|base\s+imponible|valor\s+gravado)`, 'first');
  const total = totalHit.total;

  // Coherencia: el total no puede ser menor que sus partes (ISC/propina/otros solo lo aumentan).
  if (itbis !== null && itbis > total) return null;
  if (base !== null && base > total + 1) return null;
  if (base !== null && itbis !== null && round2(base + itbis) > total + 1) return null;

  const date = findDate(text);
  const name = findSupplierName(text);
  const baseOk = base !== null && itbis !== null && Math.abs(round2(base + itbis) - total) <= 1;

  const confidence: PdfTextExtraction['confidence'] = {
    ncf: ncfHit.labeled ? 'high' : 'medium',
    supplierRnc: rncHit.checksum || rncHit.rnc.length === 11 ? 'high' : 'medium',
    totalAmount: totalHit.labeled === 'strong' ? 'high' : totalHit.labeled === 'weak' ? 'medium' : 'low',
    invoiceDate: date ? (date.labeled ? 'high' : 'low') : undefined,
    itbis: itbis !== null ? 'high' : undefined,
    baseAmount: base !== null ? (baseOk ? 'high' : 'medium') : undefined,
    supplierName: name ? 'low' : undefined,
  };
  for (const k of Object.keys(confidence) as (keyof PdfTextFields)[]) if (!confidence[k]) delete confidence[k];

  const fields: PdfTextFields = {
    ncf: ncfHit.ncf,
    supplierRnc: rncHit.rnc,
    supplierName: name,
    invoiceDate: date?.date ?? null,
    baseAmount: base,
    itbis,
    totalAmount: total,
  };

  const missing: string[] = ['Leído del texto del PDF (sin IA): confirma los datos.'];
  if (!date) missing.push('invoiceDate');
  else if (!date.labeled) missing.push('invoiceDate (sin etiqueta "Fecha": revísala)');
  if (totalHit.labeled === 'exempt') missing.push('totalAmount (tomado del monto exento: revísalo)');
  if (itbis === null) missing.push('itbis');
  if (base === null) missing.push('baseAmount');
  if (!name) missing.push('supplierName');
  missing.push('expenseType');

  const allHigh = Object.entries(confidence).filter(([k]) => k !== 'supplierName').every(([, c]) => c === 'high') && !!date?.labeled;
  const raw: RawScan = {
    supplierName: name ?? '',
    supplierRnc: rncHit.rnc,
    ncf: ncfHit.ncf,
    invoiceDate: date?.date ?? null,
    // Sin subtotal pero con ITBIS: la base es el total menos el ITBIS (normalizeScan la deduce y avisa si falta).
    baseAmount: base ?? (itbis !== null ? round2(total - itbis) : 0),
    itbis: itbis ?? 0,
    isc: 0,
    tip: 0,
    otherTax: 0,
    totalAmount: total,
    paymentMethod: '01',
    expenseType: null,
    securityCode: null,
    notes: '',
    confidence: allHigh && date && base !== null && itbis !== null ? 'high' : 'medium',
    missing,
  };
  return { fields, confidence, raw };
}

/* ---------- extracción del texto del PDF ---------- */

/** Texto de las primeras páginas del PDF, o null si no se pudo (cifrado, dañado, sin texto, demasiado grande). */
export async function pdfToText(buffer: Buffer): Promise<string | null> {
  if (buffer.length === 0 || buffer.length > SCAN_MAX_BYTES) return null;
  let parser: { getText: (o: object) => Promise<{ text: string }>; destroy: () => Promise<void> } | null = null;
  let timer: NodeJS.Timeout | undefined;
  try {
    // Carga perezosa (CJS): si la librería no carga, el escaneo sigue con IA.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PDFParse } = require('pdf-parse') as typeof import('pdf-parse');
    parser = new PDFParse({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      useSystemFonts: false,
      verbosity: 0,
    } as ConstructorParameters<typeof PDFParse>[0]);
    const timeout = new Promise<never>((_, rej) => {
      timer = setTimeout(() => rej(new Error('pdf-text timeout')), TIMEOUT_MS);
    });
    const res = await Promise.race([parser.getText({ first: MAX_PAGES }), timeout]);
    // Se descartan los separadores "-- 1 of 2 --" que añade la librería.
    const text = res.text.replace(/^-- \d+ of \d+ --$/gm, '').slice(0, MAX_CHARS);
    return text.trim().length >= 40 ? text : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
    void parser?.destroy().catch(() => undefined);
  }
}

/** Extrae los campos de la factura desde el texto del PDF; null = usar la IA. Nunca lanza. */
export async function extractFromPdfText(buffer: Buffer): Promise<PdfTextExtraction | null> {
  const text = await pdfToText(buffer);
  if (!text) return null;
  try {
    return parseInvoiceText(text);
  } catch {
    return null;
  }
}
