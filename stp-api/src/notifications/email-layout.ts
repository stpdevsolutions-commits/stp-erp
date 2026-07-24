import { COMPANY } from '../common/company';

/**
 * Utilidades para construir correos HTML del ERP de STP.
 *
 * Reglas del entorno de correo (Gmail / Outlook / Apple Mail):
 *  - Layout con <table>, nunca flex/grid.
 *  - Estilos SIEMPRE inline (los clientes eliminan <style> y no soportan variables CSS).
 *  - Fuentes del sistema, nada de webfonts.
 *  - Ancho máximo 600px (700px para tablas de resumen internas).
 *  - Botones "bulletproof" basados en tabla + VML para Outlook.
 */

// ── Paleta de identidad STP ────────────────────────────────────────────────

export const PALETTE = {
  navy: '#0D3773',
  navyDark: '#092A57',
  navyLight: '#B9CCE8',
  green: '#157B52',
  greenDark: '#0F5C3D',
  amber: '#B45309',
  red: '#B42318',
  text: '#1F2937',
  muted: '#6B7280',
  faint: '#9CA3AF',
  border: '#E5E7EB',
  page: '#EEF2F7',
  white: '#FFFFFF',
  panel: '#F9FAFB',
} as const;

/** Tonos semánticos: acento + fondo tenue + color de texto sobre el fondo tenue. */
export const TONES = {
  primary: { accent: PALETTE.navy, tint: '#EEF3FB', ink: PALETTE.navy },
  success: { accent: PALETTE.green, tint: '#EDF7F2', ink: PALETTE.greenDark },
  danger: { accent: PALETTE.red, tint: '#FDF2F2', ink: '#8F1D14' },
  warning: { accent: PALETTE.amber, tint: '#FEF6EC', ink: '#8A3F07' },
} as const;

export type ToneName = keyof typeof TONES;

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// ── Helpers de datos ───────────────────────────────────────────────────────

/** Escapa texto que se interpola dentro del HTML del correo. */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escapa una URL para usarla en href (evita romper el atributo). */
export function escUrl(value: string | undefined): string {
  return esc(value ?? '');
}

/**
 * Formatea un monto en pesos dominicanos de forma segura.
 * Nunca lanza aunque el valor venga null/undefined/NaN (ver notifySafe en quotes.service).
 */
export function money(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 'RD$ 0.00';
  return `RD$ ${n.toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ── Bloques de contenido ───────────────────────────────────────────────────

/** Párrafo de cuerpo. */
export function p(html: string, opts: { size?: number; color?: string; margin?: string } = {}): string {
  const size = opts.size ?? 15;
  const color = opts.color ?? PALETTE.text;
  const margin = opts.margin ?? '0 0 16px';
  return `<p style="margin:${margin};font-family:${FONT};font-size:${size}px;line-height:1.6;color:${color}">${html}</p>`;
}

/** Nota pequeña y discreta. */
export function note(html: string): string {
  return p(html, { size: 13, color: PALETTE.muted });
}

/**
 * Tarjeta destacada con barra de acento a la izquierda.
 * Se usa para el dato principal del correo (número de cotización, cliente, etc.).
 */
export function highlightCard(params: {
  tone?: ToneName;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  meta?: string;
}): string {
  const tone = TONES[params.tone ?? 'primary'];
  const eyebrow = params.eyebrow
    ? `<div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${PALETTE.muted};padding-bottom:6px">${params.eyebrow}</div>`
    : '';
  const subtitle = params.subtitle
    ? `<div style="font-family:${FONT};font-size:15px;line-height:1.5;color:${PALETTE.text};padding-top:4px">${params.subtitle}</div>`
    : '';
  const meta = params.meta
    ? `<div style="font-family:${FONT};font-size:13px;line-height:1.5;color:${PALETTE.muted};padding-top:8px">${params.meta}</div>`
    : '';
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 24px">
  <tr>
    <td width="4" bgcolor="${tone.accent}" style="width:4px;background-color:${tone.accent};font-size:0;line-height:0">&nbsp;</td>
    <td bgcolor="${tone.tint}" style="background-color:${tone.tint};padding:18px 22px">
      ${eyebrow}
      <div style="font-family:${FONT};font-size:19px;font-weight:700;line-height:1.3;color:${tone.ink}">${params.title}</div>
      ${subtitle}
      ${meta}
    </td>
  </tr>
</table>`;
}

/** Lista de pares etiqueta/valor en tabla (dos columnas, apta para móvil). */
export function detailRows(
  rows: { label: string; value: string; strong?: boolean; color?: string }[],
): string {
  const body = rows
    .map((r, i) => {
      const last = i === rows.length - 1;
      const border = last ? 'none' : `1px solid ${PALETTE.border}`;
      const size = r.strong ? 18 : 14;
      const weight = r.strong ? 700 : 400;
      const color = r.color ?? (r.strong ? PALETTE.navy : PALETTE.text);
      return `
  <tr>
    <td style="padding:11px 0;border-bottom:${border};font-family:${FONT};font-size:14px;color:${PALETTE.muted};vertical-align:top">${r.label}</td>
    <td align="right" style="padding:11px 0;border-bottom:${border};font-family:${FONT};font-size:${size}px;font-weight:${weight};color:${color};text-align:right;vertical-align:top">${r.value}</td>
  </tr>`;
    })
    .join('');
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 24px">
  ${body}
</table>`;
}

/** Tabla de datos con encabezado (resúmenes internos). */
export function dataTable(params: {
  headers: { label: string; align?: 'left' | 'right' }[];
  rows: string[][];
  alignments?: ('left' | 'right')[];
}): string {
  const { headers, rows, alignments } = params;
  const head = headers
    .map(
      (h) =>
        `<th align="${h.align ?? 'left'}" style="padding:10px 12px;border-bottom:1px solid ${PALETTE.border};font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:${PALETTE.muted};text-align:${h.align ?? 'left'}">${h.label}</th>`,
    )
    .join('');
  const body = rows
    .map(
      (cells) =>
        `<tr>${cells
          .map((c, i) => {
            const align = alignments?.[i] ?? 'left';
            return `<td align="${align}" style="padding:11px 12px;border-bottom:1px solid ${PALETTE.border};font-family:${FONT};font-size:14px;line-height:1.4;color:${PALETTE.text};text-align:${align}">${c}</td>`;
          })
          .join('')}</tr>`,
    )
    .join('');
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid ${PALETTE.border};margin:0 0 24px">
  <thead><tr bgcolor="${PALETTE.panel}" style="background-color:${PALETTE.panel}">${head}</tr></thead>
  <tbody>${body}</tbody>
</table>`;
}

/** Botón "bulletproof": tabla + VML para que Outlook lo renderice igual. */
export function button(params: {
  href: string;
  label: string;
  color?: string;
  width?: number;
}): string {
  const color = params.color ?? PALETTE.navy;
  const href = escUrl(params.href);
  const label = esc(params.label);
  const width = params.width ?? 220;
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate">
  <tr>
    <td align="center" bgcolor="${color}" style="background-color:${color};border-radius:6px" >
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:46px;v-text-anchor:middle;width:${width}px" arcsize="13%" stroke="f" fillcolor="${color}">
      <w:anchorlock/><center style="color:#ffffff;font-family:${FONT};font-size:15px;font-weight:bold;">${label}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a href="${href}" style="display:inline-block;min-width:${width - 56}px;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;border-radius:6px;text-align:center">${label}</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
}

/**
 * Fila de botones centrada.
 * Se usan <div> con display:inline-block: los clientes modernos los ponen uno al
 * lado del otro (y los envuelven a línea nueva en pantallas estrechas), mientras
 * que Outlook —que ignora inline-block— simplemente los apila. Nunca desborda.
 */
export function buttonRow(
  buttons: { href: string; label: string; color?: string; width?: number }[],
): string {
  const items = buttons
    .map(
      (b) =>
        `<div style="display:inline-block;vertical-align:top;margin:6px 6px">${button(b)}</div>`,
    )
    .join('');
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:8px 0 16px">
  <tr><td align="center" style="text-align:center">${items}</td></tr>
</table>`;
}

/** Enlace de respaldo en texto (por si el botón no abre). */
export function fallbackLink(url: string, label = 'Si el botón no funciona, copie y pegue este enlace en su navegador:'): string {
  return `<p style="margin:0 0 8px;font-family:${FONT};font-size:12px;line-height:1.6;color:${PALETTE.faint};text-align:center;word-break:break-all">${label}<br><a href="${escUrl(url)}" style="color:${PALETTE.navy};text-decoration:underline">${esc(url)}</a></p>`;
}

// ── Bloque de contacto (obligatorio en TODOS los correos) ──────────────────

const CONTACT_SENTENCE_CLIENT = `Si necesita asistencia puede contactarnos al correo <a href="mailto:${COMPANY.email}" style="color:${PALETTE.navy};text-decoration:underline">${COMPANY.email}</a> o a los teléfonos <strong style="color:${PALETTE.text}">${COMPANY.phones}</strong>.`;

const CONTACT_SENTENCE_INTERNAL = `Para cualquier gestión relacionada con esta notificación puede escribir a <a href="mailto:${COMPANY.email}" style="color:${PALETTE.navy};text-decoration:underline">${COMPANY.email}</a> o llamar a los teléfonos <strong style="color:${PALETTE.text}">${COMPANY.phones}</strong>.`;

/** Versión en texto plano del bloque de contacto. */
export function contactText(audience: Audience = 'client'): string {
  return audience === 'client'
    ? `Si necesita asistencia puede contactarnos al correo ${COMPANY.email} o a los teléfonos ${COMPANY.phones}.`
    : `Para cualquier gestión relacionada con esta notificación puede escribir a ${COMPANY.email} o llamar a los teléfonos ${COMPANY.phones}.`;
}

export type Audience = 'client' | 'internal';

// ── Layout ─────────────────────────────────────────────────────────────────

/**
 * Envuelve el contenido de un correo en la identidad de STP:
 * cabecera con marca, banda de título con color de acento, cuerpo y
 * pie único con el bloque de contacto y los datos de la empresa.
 */
export function emailLayout(params: {
  title: string;
  preheader: string;
  bodyHtml: string;
  accentColor?: string;
  eyebrow?: string;
  audience?: Audience;
  maxWidth?: number;
}): string {
  const accent = params.accentColor ?? PALETTE.green;
  const audience = params.audience ?? 'client';
  const width = params.maxWidth ?? 600;
  const eyebrow = params.eyebrow
    ? `<div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${PALETTE.navyLight};padding-bottom:6px">${esc(params.eyebrow)}</div>`
    : '';
  const contact = audience === 'client' ? CONTACT_SENTENCE_CLIENT : CONTACT_SENTENCE_INTERNAL;
  const internalNote =
    audience === 'internal'
      ? `<p style="margin:0 0 12px;font-family:${FONT};font-size:12px;line-height:1.6;color:${PALETTE.faint};text-align:center">Notificación automática del sistema interno STP ERP. No responda a este mensaje.</p>`
      : '';

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="es">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${esc(params.title)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${PALETTE.page};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
<div style="display:none;font-size:1px;color:${PALETTE.page};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${esc(params.preheader)}&#8199;&#65279;&#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PALETTE.page}" style="background-color:${PALETTE.page};border-collapse:collapse">
  <tr>
    <td align="center" style="padding:28px 12px">
      <table role="presentation" width="${width}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${width}px;border-collapse:collapse;background-color:${PALETTE.white};border:1px solid #DDE3EC;border-radius:10px;overflow:hidden">

        <!-- Cabecera -->
        <tr>
          <td bgcolor="${PALETTE.navy}" style="background-color:${PALETTE.navy};padding:26px 32px 22px">
            ${eyebrow}
            <div style="font-family:${FONT};font-size:20px;font-weight:700;line-height:1.3;color:#ffffff;letter-spacing:.2px">${esc(COMPANY.name)}</div>
            <div style="font-family:${FONT};font-size:12px;line-height:1.5;color:${PALETTE.navyLight};padding-top:4px">Electromecánica y Construcción &nbsp;·&nbsp; ${esc(COMPANY.website)}</div>
          </td>
        </tr>
        <tr>
          <td bgcolor="${accent}" style="background-color:${accent};height:4px;font-size:0;line-height:0">&nbsp;</td>
        </tr>

        <!-- Título -->
        <tr>
          <td style="padding:28px 32px 0">
            <h1 style="margin:0 0 20px;font-family:${FONT};font-size:22px;font-weight:700;line-height:1.3;color:${PALETTE.navy}">${esc(params.title)}</h1>
          </td>
        </tr>

        <!-- Cuerpo -->
        <tr>
          <td style="padding:0 32px 28px">
            ${params.bodyHtml}
          </td>
        </tr>

        <!-- Bloque de contacto -->
        <tr>
          <td bgcolor="${PALETTE.panel}" style="background-color:${PALETTE.panel};border-top:1px solid ${PALETTE.border};padding:22px 32px">
            <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.7;color:${PALETTE.text};text-align:center">${contact}</p>
          </td>
        </tr>

        <!-- Pie -->
        <tr>
          <td bgcolor="${PALETTE.white}" style="background-color:${PALETTE.white};border-top:1px solid ${PALETTE.border};padding:22px 32px 26px">
            ${internalNote}
            <p style="margin:0 0 4px;font-family:${FONT};font-size:13px;font-weight:700;line-height:1.5;color:${PALETTE.navy};text-align:center">${esc(COMPANY.name)} (${esc(COMPANY.shortName)})</p>
            <p style="margin:0 0 4px;font-family:${FONT};font-size:12px;line-height:1.6;color:${PALETTE.muted};text-align:center">RNC ${esc(COMPANY.rnc)} &nbsp;·&nbsp; ${esc(COMPANY.address1)}<br>${esc(COMPANY.address2)}</p>
            <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${PALETTE.muted};text-align:center">
              <a href="mailto:${esc(COMPANY.email)}" style="color:${PALETTE.navy};text-decoration:none">${esc(COMPANY.email)}</a>
              &nbsp;·&nbsp; ${esc(COMPANY.phones)}
              &nbsp;·&nbsp; <a href="https://${esc(COMPANY.website)}" style="color:${PALETTE.navy};text-decoration:none">${esc(COMPANY.website)}</a>
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Pie en texto plano, con el bloque de contacto y los datos de la empresa. */
export function textFooter(audience: Audience = 'client'): string {
  return [
    '',
    contactText(audience),
    '',
    '—',
    `${COMPANY.name} (${COMPANY.shortName})`,
    `RNC ${COMPANY.rnc}`,
    `${COMPANY.address1}, ${COMPANY.address2}`,
    `${COMPANY.email} · ${COMPANY.phones} · ${COMPANY.website}`,
  ].join('\n');
}

/** Compone un correo en texto plano: líneas del cuerpo + pie estándar. */
export function plainText(lines: string[], audience: Audience = 'client'): string {
  return `${lines.join('\n')}\n${textFooter(audience)}`;
}
