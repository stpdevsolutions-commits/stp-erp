/**
 * Código QR de un e-CF (comprobante fiscal electrónico). Lógica pura (qr-ecf.spec.ts).
 *
 * El QR de un e-CF es un enlace al portal de la DGII con los datos del comprobante en la
 * dirección (norma 06-2018):
 *   https://ecf.dgii.gov.do/ecf/ConsultaTimbre?RncEmisor=…&RncComprador=…&ENCF=…
 *   &FechaEmision=dd-MM-yyyy&MontoTotal=…&FechaFirma=…&CodigoSeguridad=…
 * (las facturas de consumo, E32, usan fc.dgii.gov.do/ecf/ConsultaTimbreFC).
 *
 * Portado de `parseQrCode` de FiscoRD, con una diferencia de seguridad: aquí solo se aceptan
 * enlaces de dgii.gov.do, porque el servidor luego CONSULTA esa dirección y un QR cualquiera
 * no puede mandarlo a otro sitio.
 */
import { isValidNcf, isValidRnc, normalizeNcf, normalizeRnc } from './fiscal-invoice-rules';
import { validIsoDate } from './invoice-scan';

export class QrParseError extends Error {}

export interface EcfQr {
  /** La dirección completa del QR (ya comprobada como de la DGII). */
  url: string;
  supplierRnc: string;
  buyerRnc: string | null;
  ncf: string;
  invoiceDate: string | null;
  total: number | null;
  securityCode: string | null;
  /** Solo si algún QR lo trae (el estándar no lo incluye). */
  itbis: number | null;
}

/** `dgii.gov.do` o cualquiera de sus subdominios (ecf., fc., www.). */
export function isDgiiUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (u.protocol === 'https:' || u.protocol === 'http:') && /(^|\.)dgii\.gov\.do$/i.test(u.hostname);
  } catch {
    return false;
  }
}

/** '05-10-2026' o '05/10/2026' → '2026-10-05'; null si no es una fecha válida. */
export function dgiiDateToIso(raw: string | null | undefined): string | null {
  const m = (raw ?? '').trim().match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (!m) return validIsoDate(raw);
  return validIsoDate(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
}

const amount = (v: string | undefined): number | null => {
  const n = parseFloat((v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function parseDgiiQr(text: string): EcfQr {
  const raw = (text ?? '').trim();
  if (!/^https?:\/\//i.test(raw)) {
    throw new QrParseError('Ese código QR no es de un comprobante de la DGII.');
  }
  if (!isDgiiUrl(raw)) {
    throw new QrParseError('Ese código QR no es de la DGII, así que no se consulta.');
  }

  const params = new Map<string, string>();
  for (const [k, v] of new URL(raw).searchParams) params.set(k.toLowerCase(), v);
  const get = (...keys: string[]) => keys.map((k) => params.get(k)).find((v) => v !== undefined && v !== '');

  const supplierRnc = normalizeRnc(get('rncemisor', 'rnc') ?? '');
  const ncf = normalizeNcf(get('encf', 'ncf', 'ncfe') ?? '');
  if (!isValidRnc(supplierRnc) || !isValidNcf(ncf)) {
    throw new QrParseError('El QR no trae un RNC y un e-NCF válidos. Prueba escaneando la factura con la cámara.');
  }

  // searchParams convertiría un "+" en espacio, y el código (Base64) puede traerlo: se lee a mano.
  const rawCode = /[?&]codigoseguridad=([^&#]*)/i.exec(raw)?.[1] ?? '';
  let code = rawCode;
  try {
    code = decodeURIComponent(rawCode);
  } catch {
    /* se queda como vino y la validación de abajo lo descarta si es raro */
  }
  code = code.trim();
  const buyer = normalizeRnc(get('rnccomprador') ?? '');
  return {
    url: raw,
    supplierRnc,
    buyerRnc: isValidRnc(buyer) ? buyer : null,
    ncf,
    invoiceDate: dgiiDateToIso(get('fechaemision')),
    total: amount(get('montototal')),
    securityCode: /^[A-Za-z0-9+/]{4,16}$/.test(code) ? code : null,
    itbis: amount(get('totalitbis')),
  };
}
