/**
 * Parsers puros de las consultas web de la DGII (portal ASP.NET WebForms). Sin red ni
 * Nest: se prueban con respuestas reales guardadas en `fixtures/` (dgii-html.spec.ts).
 *
 * Portado de las funciones validate-rnc / validate-ecf de FiscoRD. El SOAP viejo
 * (wsMovilDGII.asmx) lo retiró la DGII; este portal es el único camino vigente.
 */

const NAMED_ENTITIES: Record<string, string> = {
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ',
  amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ',
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&([A-Za-z]+);/g, (whole, name: string) => NAMED_ENTITIES[name] ?? whole);
}

export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

/** Texto del `<span id="…">` o null si el elemento no está en la página. */
export function extractSpan(html: string, id: string): string | null {
  const m = html.match(new RegExp(`id=["']${id}["'][^>]*>([^<]*)<`, 'i'));
  return m ? stripTags(m[1]) : null;
}

export function hasElement(html: string, id: string): boolean {
  return new RegExp(`id=["']${id}["']`, 'i').test(html);
}

/** Pares etiqueta → valor de filas `<td>Etiqueta</td><td>Valor</td>`, con la etiqueta en minúsculas. */
export function extractLabelValueTable(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const rowRe = /<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const key = stripTags(m[1]).toLowerCase();
    if (key) out[key] = stripTags(m[2]);
  }
  return out;
}

export function getField(map: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = map[k.toLowerCase()];
    if (v) return v;
  }
  return '';
}

/** "VIGENTE" → "Vigente": así se guarda en la factura y se muestra en pantalla. */
export function titleCase(s: string): string {
  const t = s.trim().toLowerCase();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

// ── Consulta de RNC ─────────────────────────────────────────────────────────

export interface RncInfo {
  found: boolean;
  rnc: string;
  name?: string;
  tradeName?: string;
  status?: string;
  paymentScheme?: string;
  activity?: string;
  localAdmin?: string;
  isElectronicBiller?: boolean;
  /** Lo que dijo la DGII cuando no lo encontró. */
  message?: string;
}

export function parseRncPage(html: string, rnc: string): RncInfo {
  // `lblInformacion` solo aparece aquí cuando la DGII no encuentra al contribuyente.
  if (hasElement(html, 'cphMain_lblInformacion')) {
    return { found: false, rnc, message: extractSpan(html, 'cphMain_lblInformacion') || 'RNC no encontrado' };
  }
  const fields = extractLabelValueTable(html);
  const name = getField(fields, 'nombre/razón social', 'nombre/razon social');
  if (!name) return { found: false, rnc, message: 'RNC no encontrado' };

  return {
    found: true,
    rnc: getField(fields, 'cédula/rnc', 'cedula/rnc').replace(/\D/g, '') || rnc,
    name,
    tradeName: getField(fields, 'nombre comercial') || undefined,
    status: getField(fields, 'estado') || undefined,
    paymentScheme: getField(fields, 'régimen de pagos', 'regimen de pagos') || undefined,
    activity: getField(fields, 'actividad economica', 'actividad económica') || undefined,
    localAdmin: getField(fields, 'administracion local', 'administración local') || undefined,
    isElectronicBiller:
      getField(fields, 'facturador electrónico', 'facturador electronico').toUpperCase() === 'SI',
  };
}

export interface RncSearchRow {
  rnc: string;
  name: string;
  tradeName?: string;
  status?: string;
}

/** Resultado de buscar por razón social: una fila `TbRow` por contribuyente. */
export function parseRncSearch(html: string): RncSearchRow[] {
  if (hasElement(html, 'cphMain_lblInformacion')) return [];
  const rows = html.match(/<tr class="TbRow">([\s\S]*?)<\/tr>/gi) ?? [];
  const cell = (row: string, label: string) =>
    stripTags(row.match(new RegExp(`data-label=["']${label}["']>([^<]*)<`, 'i'))?.[1] ?? '');
  return rows
    .map((row) => ({
      rnc: cell(row, 'Cédula/RNC').replace(/\D/g, ''),
      name: cell(row, 'Nombre/Razón Social'),
      tradeName: cell(row, 'Nombre Comercial') || undefined,
      status: cell(row, 'Estado') || undefined,
    }))
    .filter((r) => r.rnc);
}

// ── Consulta de comprobante (NCF y e-CF) ────────────────────────────────────

export type ComprobanteVerdict =
  /** La DGII lo reconoce y está en regla (Vigente / Aceptado). */
  | 'valid'
  /** Lo reconoce pero no está en regla (Vencido, Anulado, Rechazado…). */
  | 'rejected'
  /** No existe o no corresponde a ese RNC. */
  | 'not-found'
  /** Falta un dato (un e-CF pide RNC comprador y código de seguridad). */
  | 'needs-data'
  /** Respuesta que no se reconoce: no se guarda nada. */
  | 'unknown';

export interface ComprobanteResult {
  verdict: ComprobanteVerdict;
  /** Lo que se guarda en la factura: Vigente, Aceptado, No encontrado… (null si no hay veredicto). */
  estado: string | null;
  /** Texto de la DGII o resumen, listo para mostrar. */
  message: string;
  isEcf: boolean;
  emisor?: string;
  tipo?: string;
  vigencia?: string;
  montoTotal?: number;
  itbis?: number;
  fechaEmision?: string;
}

const money = (s: string | null): number | undefined => {
  const n = parseFloat((s ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
};

export function parseComprobantePage(html: string, isEcf: boolean): ComprobanteResult {
  // La DGII a veces manda este mensaje entre comillas ("Para consultar…"): se quitan.
  const info = (extractSpan(html, 'cphMain_lblInformacion') ?? '').replace(/^["“”]+|["“”]+$/g, '').trim();
  const fePanel = hasElement(html, 'cphMain_lblEstadoFe');
  const nfPanel = hasElement(html, 'cphMain_lblEstado');

  if (fePanel || nfPanel) {
    const raw = (fePanel ? extractSpan(html, 'cphMain_lblEstadoFe') : extractSpan(html, 'cphMain_lblEstado')) ?? '';
    const norm = raw.trim().toLowerCase();
    const ok = ['aceptado', 'válido', 'valido', 'vigente'].includes(norm);
    const extra = fePanel
      ? {
          montoTotal: money(extractSpan(html, 'cphMain_lblMontoTotal')),
          itbis: money(extractSpan(html, 'cphMain_lblTotalItbis')),
          fechaEmision: extractSpan(html, 'cphMain_lblFechaEmision') || undefined,
        }
      : {};
    return {
      verdict: ok ? 'valid' : 'rejected',
      estado: raw ? titleCase(raw) : ok ? 'Aceptado' : null,
      message: info || (ok ? 'Comprobante válido en la DGII' : `Comprobante ${raw.toLowerCase() || 'no válido'} en la DGII`),
      isEcf,
      emisor: extractSpan(html, 'cphMain_lblRazonSocial') || undefined,
      tipo: extractSpan(html, 'cphMain_lblTipoComprobante') || undefined,
      vigencia: extractSpan(html, 'cphMain_lblVigencia') || undefined,
      ...extra,
    };
  }

  if (/es necesario completar/i.test(info)) {
    return { verdict: 'needs-data', estado: null, message: info, isEcf };
  }
  if (/no es correcto|no corresponde|no se encuentra|no encontrado/i.test(info)) {
    return { verdict: 'not-found', estado: 'No encontrado', message: info, isEcf };
  }
  return {
    verdict: 'unknown',
    estado: null,
    message: info || 'La DGII respondió algo que no se pudo interpretar',
    isEcf,
  };
}

// ── Página de consulta del timbre de un e-CF (la que abre el QR) ────────────

export interface TimbreInfo {
  /** La DGII dijo que no encontró esa factura (o no coinciden los valores). */
  notFound: boolean;
  supplierName?: string;
  estado?: string;
  itbis?: number;
  total?: number;
  /** Fecha de emisión tal como la muestra la DGII. */
  fecha?: string;
}

/** Pares `<th>Etiqueta</th><td>Valor</td>`, con la etiqueta en minúsculas. */
export function extractThTdTable(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const rowRe = /<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const key = stripTags(m[1]).toLowerCase();
    if (key) out[key] = stripTags(m[2]);
  }
  return out;
}

/**
 * Lee la página de consulta del timbre. La parte de "no encontrada" está verificada con
 * respuestas reales de la DGII; la de "encontrada" sigue los rótulos que FiscoRD ya leía en
 * producción (Razón social emisor, Estado, Total de ITBIS, Monto total, Fecha de emisión),
 * porque sin un QR real no se pudo capturar una página de éxito para comprobarla.
 */
export function parseTimbrePage(html: string): TimbreInfo {
  if (/no fue encontrada/i.test(stripTags(html))) return { notFound: true };

  const map = { ...extractThTdTable(html), ...extractLabelValueTable(html) };
  const money = (v: string) => {
    const n = parseFloat(v.replace(/,/g, '').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  };
  const name = getField(map, 'razón social emisor', 'razon social emisor', 'nombre emisor', 'emisor');
  const estado = getField(map, 'estado', 'status', 'estatus');
  const itbis = getField(map, 'total de itbis', 'total itbis', 'itbis', 'monto itbis');
  const total = getField(map, 'monto total', 'total', 'total factura', 'valor total');
  const fecha = getField(map, 'fecha de emisión', 'fecha de emision', 'fecha emisión', 'fecha');
  return {
    notFound: false,
    supplierName: name || undefined,
    estado: estado ? titleCase(estado) : undefined,
    itbis: itbis ? money(itbis) : undefined,
    total: total ? money(total) : undefined,
    fecha: fecha || undefined,
  };
}
