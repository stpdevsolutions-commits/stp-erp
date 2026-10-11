/**
 * Escaneo de facturas con IA (ERP-36): el prompt, el esquema de respuesta y la limpieza de
 * lo que devuelve el modelo. Lógica pura, sin red ni Nest, para probarla sola
 * (invoice-scan.spec.ts). La llamada al modelo vive en invoice-scan.service.ts.
 *
 * Portado de la función `scan-invoice` de FiscoRD, con tres diferencias a propósito:
 * usa el catálogo real del 606 (01–11, sin el "12 / 99" inventado), pide también el TOTAL
 * para poder detectar montos que no cuadran, y no inventa la fecha de hoy si no la lee.
 */
import {
  EXPENSE_TYPE_CODES,
  PAYMENT_METHOD_CODES,
  isValidNcf,
  isValidRnc,
  normalizeNcf,
  normalizeRnc,
  round2,
} from './fiscal-invoice-rules';

/** Tipos de archivo que se aceptan para escanear (las fotos y el PDF de un e-CF). */
export const SCAN_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const SCAN_MAX_BYTES = 8 * 1024 * 1024;

export const SCAN_SCHEMA = {
  type: 'object',
  properties: {
    supplierName: { type: ['string', 'null'], description: 'Nombre EXACTO del emisor, como aparece. null si no se lee.' },
    supplierRnc: {
      type: ['string', 'null'],
      description: 'RNC o cédula del EMISOR, solo dígitos. Búscalo junto a "RNC". null si no se lee.',
    },
    ncf: {
      type: ['string', 'null'],
      description:
        'NCF o e-NCF COMPLETO (B0100000001 de 11 caracteres, E310000000001 de 13), exacto. null si no se lee.',
    },
    invoiceDate: {
      type: ['string', 'null'],
      description: 'Fecha de emisión en formato YYYY-MM-DD. null si no se lee. No uses la fecha de hoy.',
    },
    baseAmount: { type: 'number', description: 'Subtotal o monto ANTES de impuestos. Nunca el total final.' },
    itbis: { type: 'number', description: 'ITBIS (18 %). 0 si no aparece.' },
    isc: { type: 'number', description: 'Impuesto selectivo al consumo. 0 si no aparece.' },
    tip: { type: 'number', description: 'Propina legal (10 %). 0 si no aparece.' },
    otherTax: { type: 'number', description: 'Otros impuestos o tasas. 0 si no aparecen.' },
    totalAmount: { type: ['number', 'null'], description: 'TOTAL final de la factura. null si no se lee.' },
    paymentMethod: {
      type: 'string',
      enum: [...PAYMENT_METHOD_CODES],
      description: '01 efectivo, 02 cheque/transferencia/depósito, 03 tarjeta, 04 crédito, 05 permuta, 06 nota de crédito, 07 mixto. Ante la duda "01".',
    },
    expenseType: {
      type: ['string', 'null'],
      description:
        'Código 01 a 11 del tipo de gasto del Formato 606 (ver reglas). null si no estás razonablemente seguro.',
    },
    securityCode: {
      type: ['string', 'null'],
      description:
        'Solo en e-CF: el "Código de seguridad" impreso junto al QR (6 caracteres). null si no está o no es e-CF.',
    },
    notes: { type: 'string', description: 'Qué se compró, en pocas palabras (p. ej. "cable UTP y conectores"). Vacío si no se entiende.' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Tu confianza en la lectura.' },
    missing: { type: 'array', items: { type: 'string' }, description: 'Campos que no pudiste leer o dudas.' },
  },
  required: [
    'supplierName', 'supplierRnc', 'ncf', 'invoiceDate', 'baseAmount', 'itbis', 'isc', 'tip',
    'otherTax', 'totalAmount', 'paymentMethod', 'expenseType', 'securityCode', 'notes', 'confidence', 'missing',
  ],
} as const;

export const SCAN_SYSTEM_PROMPT = `Lees facturas y comprobantes fiscales de República Dominicana (NCF y e-CF) para el ERP de una empresa de construcción y domótica, que las registrará en su Formato 606.

Reglas CRÍTICAS:
- No inventes: si no puedes leer algo con claridad usa null (texto) o 0 (monto) y anótalo en "missing". Una cifra inventada es peor que un campo vacío.
- Lee cada carácter con precisión. NUNCA mezcles el RNC con el NCF: son campos distintos.
- baseAmount es el SUBTOTAL, antes de impuestos. NUNCA pongas el total final como baseAmount.
- itbis es el ITBIS (18 %); tip la propina legal (10 %); isc el selectivo; otherTax cualquier otro impuesto o tasa.
- totalAmount es el TOTAL final. baseAmount + itbis + isc + tip + otherTax debería dar totalAmount; si no cuadra, baja la confianza y anótalo en "missing".
- supplierRnc y supplierName son del EMISOR (quien vende), no del comprador.
- El NCF de papel tiene 11 caracteres (B01 + 8 dígitos); el e-NCF tiene 13 (E31 + 10 dígitos).
- securityCode solo existe en e-CF: es el "Código de seguridad" impreso junto al QR.
- Si la imagen está borrosa, inclinada o cortada: confidence "low" y lista lo dudoso en "missing".

expenseType (tipo de gasto del Formato 606), elige por lo que se compró:
01 gastos de personal; 02 trabajos, suministros y servicios (servicios profesionales, contratistas, mantenimiento, comunicaciones, transporte, médicos); 03 arrendamientos; 04 reparación de activos fijos; 05 gastos de representación (atenciones a clientes, regalos); 06 otras deducciones admitidas; 07 gastos financieros (intereses, comisiones bancarias); 08 gastos extraordinarios; 09 compras y gastos que forman parte del costo de venta (materiales, mercancía, herramientas, combustible, útiles); 10 adquisición de activos (equipo o mobiliario NUEVO); 11 seguros.
Ejemplos: ferretería o materiales eléctricos → "09"; alquiler de local → "03"; compra de una laptop → "10"; abogado o contador → "02"; restaurante → "05". Si no estás razonablemente seguro, null.`;

export const SCAN_USER_PROMPT = 'Extrae los datos de esta factura según el esquema.';

/** Lo que devuelve el modelo (aún sin confiar en ello). */
export interface RawScan {
  supplierName?: unknown;
  supplierRnc?: unknown;
  ncf?: unknown;
  invoiceDate?: unknown;
  baseAmount?: unknown;
  itbis?: unknown;
  isc?: unknown;
  tip?: unknown;
  otherTax?: unknown;
  totalAmount?: unknown;
  paymentMethod?: unknown;
  expenseType?: unknown;
  securityCode?: unknown;
  notes?: unknown;
  confidence?: unknown;
  missing?: unknown;
}

export interface ScanFields {
  ncf: string;
  supplierRnc: string;
  supplierName: string;
  invoiceDate: string | null;
  baseAmount: number;
  itbis: number;
  isc: number;
  tip: number;
  otherTax: number;
  paymentMethod: string;
  expenseType: string | null;
  securityCode: string | null;
  notes: string;
}

export interface ScanResult {
  fields: ScanFields;
  totalAmount: number | null;
  confidence: 'high' | 'medium' | 'low';
  /** Campos que el modelo no leyó o dudó (en sus palabras). */
  missing: string[];
  /** Avisos nuestros, de comprobar lo leído contra las reglas fiscales. */
  warnings: string[];
  /** Si esa factura (RNC + NCF) ya está registrada. */
  duplicate: { id: string; ncf: string; supplierName: string; invoiceDate: string } | null;
  /** Cómo se leyó: foto con IA o código QR del e-CF. */
  source: 'ia' | 'qr';
  /** Avisos buenos (no son problemas): p. ej. "tipo de gasto tomado de tus 7 facturas anteriores". */
  hints: string[];
  /** Resultado de la DGII si la lectura ya lo trajo (QR): Aceptado, Vigente… */
  estadoDgii: string | null;
}

/** Lo que sale de normalizar una lectura, antes de contrastarla con lo ya registrado. */
export type ScanCore = Omit<ScanResult, 'duplicate' | 'source' | 'hints' | 'estadoDgii'>;

/**
 * Saca el primer objeto JSON balanceado de un texto: un modelo a veces envuelve el JSON en
 * ```json o le deja una llave de más al final, y un simple replace no alcanza.
 */
export function extractJsonObject(text: string): string {
  const cleaned = text.replace(/```json\s?|```/g, '').trim();
  const start = cleaned.indexOf('{');
  if (start === -1) return cleaned;
  let depth = 0;
  let inString = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return cleaned.slice(start, i + 1);
  }
  return cleaned.slice(start);
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const money = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? round2(n) : 0;
};

/** Una fecha YYYY-MM-DD que exista de verdad (no 2026-02-31) y no sea del futuro lejano. */
export function validIsoDate(v: unknown): string | null {
  const s = str(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  if (d.getTime() > Date.now() + 2 * 86_400_000) return null;
  return s;
}

/**
 * Convierte lo que dijo el modelo en algo seguro de poner en el formulario, y lo contrasta
 * con las reglas fiscales: lo dudoso no se corrige a escondidas, se avisa.
 */
export function normalizeScan(raw: RawScan): ScanCore {
  const warnings: string[] = [];
  const missing = (Array.isArray(raw.missing) ? raw.missing : []).filter((m): m is string => typeof m === 'string' && !!m.trim());

  const ncf = normalizeNcf(str(raw.ncf));
  if (!ncf) warnings.push('No se pudo leer el NCF: escríbelo a mano.');
  else if (!isValidNcf(ncf)) warnings.push(`El NCF leído (${ncf}) no tiene un formato válido: revísalo contra la factura.`);

  const supplierRnc = normalizeRnc(str(raw.supplierRnc));
  if (!supplierRnc) warnings.push('No se pudo leer el RNC del emisor: escríbelo a mano.');
  else if (!isValidRnc(supplierRnc)) warnings.push(`El RNC leído (${supplierRnc}) no tiene 9 u 11 dígitos: revísalo.`);

  const invoiceDate = validIsoDate(raw.invoiceDate);
  if (!invoiceDate) warnings.push('No se pudo leer una fecha válida: elígela a mano.');

  let baseAmount = money(raw.baseAmount);
  const itbis = money(raw.itbis);
  const isc = money(raw.isc);
  const tip = money(raw.tip);
  const otherTax = money(raw.otherTax);
  const total = money(raw.totalAmount) || null;
  const taxes = round2(itbis + isc + tip + otherTax);

  if (total !== null) {
    if (baseAmount === 0 && total > taxes) {
      // El modelo dejó la base en 0 pero leyó el total: se deduce, y se dice.
      baseAmount = round2(total - taxes);
      warnings.push(`La base se calculó a partir del total (${total}) menos los impuestos: confírmala.`);
    } else if (Math.abs(round2(baseAmount + taxes) - total) > 1) {
      warnings.push(
        `Los montos no cuadran: base + impuestos suman ${round2(baseAmount + taxes)} pero el total de la factura dice ${total}. Revisa cuál se leyó mal.`,
      );
    }
  } else if (baseAmount === 0) {
    warnings.push('No se pudo leer ningún monto: escríbelos a mano.');
  }

  const payment = str(raw.paymentMethod);
  const expense = str(raw.expenseType);
  const code = str(raw.securityCode);
  const isElectronic = ncf.startsWith('E');
  const confidence = raw.confidence === 'high' || raw.confidence === 'low' ? raw.confidence : 'medium';

  return {
    fields: {
      ncf,
      supplierRnc,
      supplierName: str(raw.supplierName),
      invoiceDate,
      baseAmount,
      itbis,
      isc,
      tip,
      otherTax,
      paymentMethod: PAYMENT_METHOD_CODES.includes(payment) ? payment : '01',
      expenseType: EXPENSE_TYPE_CODES.includes(expense) ? expense : null,
      securityCode: isElectronic && /^[A-Za-z0-9]{4,16}$/.test(code) ? code : null,
      notes: str(raw.notes),
    },
    totalAmount: total,
    confidence,
    missing,
    warnings,
  };
}

/** Comprueba que los primeros bytes del archivo son del tipo que dice ser (el tipo lo manda el cliente). */
export function matchesMagic(buf: Buffer, mime: string): boolean {
  switch (mime) {
    case 'image/jpeg':
      return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'image/png':
      return buf.length > 4 && buf[0] === 0x89 && buf.subarray(1, 4).toString('ascii') === 'PNG';
    case 'application/pdf':
      return buf.length > 4 && buf.subarray(0, 4).toString('ascii') === '%PDF';
    case 'image/webp':
      return buf.length > 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
    default:
      return false;
  }
}
