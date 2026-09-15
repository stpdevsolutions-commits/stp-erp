import type PDFDocument from 'pdfkit';
import type { CompanyData } from './company';

export const DARK_BLUE   = '#1a3c6e';
export const TEAL        = '#0d9488';
export const MID_GRAY    = '#6b7280';
export const DARK_TEXT   = '#1f2937';
export const BORDER_GRAY = '#e5e7eb';

export const LEFT  = 50;
export const RIGHT = 545;
export const WIDTH = RIGHT - LEFT;

export const HEADER_H  = 110;
export const CONTENT_Y = HEADER_H + 16;

/**
 * Escribe un campo de una sola línea que NUNCA se parte en dos.
 *
 * `lineBreak: false` por sí solo no alcanza: pdfkit solo lo consulta para
 * decidir si inventa un `width` por defecto (ver `_initOptions`) — en cuanto
 * se pasa un `width` explícito (como aquí, siempre), el texto se envuelve
 * igual sin importar `lineBreak`. Con `height` fijo a una línea + `ellipsis`,
 * si el texto no cabe se trunca con "…" en vez de partirse y montarse sobre
 * el contenido de la fila siguiente.
 */
export function textLine(
  doc: InstanceType<typeof PDFDocument>,
  text: string,
  x: number,
  y: number,
  width: number,
  options: Record<string, unknown> = {},
): void {
  doc.text(text, x, y, {
    ...options,
    width,
    height: doc.currentLineHeight(),
    ellipsis: true,
  });
}

/** Alto real que ocupará `text` envuelto a `width` con la fuente/tamaño actuales. */
export function textHeight(
  doc: InstanceType<typeof PDFDocument>,
  text: string,
  width: number,
): number {
  return doc.heightOfString(text || '—', { width });
}

export function drawDocumentHeader(
  doc: InstanceType<typeof PDFDocument>,
  documentType: string,
  documentNumber: string,
  logoPath: string | null,
  company: CompanyData,
): void {
  // ── Logo ─────────────────────────────────────────────────────────────────
  if (logoPath) {
    try {
      doc.image(logoPath, LEFT, 20, { fit: [60, 60] });
    } catch { /* non-fatal */ }
  }

  // ── Company info (left column) ────────────────────────────────────────────
  const infoX = LEFT + 72;
  const infoW = 248;

  doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(14)
    .text(company.name, infoX, 22, { width: infoW, lineBreak: false });

  doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(8.5)
    .text(`${company.shortName}  ·  RNC: ${company.rnc}`, infoX, 41, { width: infoW, lineBreak: false });

  doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7.5)
    .text(company.address1, infoX, 54, { width: infoW, lineBreak: false })
    .text(company.address2, infoX, 64, { width: infoW, lineBreak: false })
    .text(`Tel: ${company.phones}`, infoX, 74, { width: infoW, lineBreak: false })
    .text(`${company.email}  ·  ${company.website}`, infoX, 84, { width: infoW, lineBreak: false });

  // ── Document type + number (right column) ─────────────────────────────────
  // 16pt en vez de 20: junto al nombre de la empresa a 14pt, 20pt se veía
  // desproporcionado — 16pt sigue siendo lo más grande de la página, pero
  // dentro de la misma escala que el resto del encabezado.
  const docX = 358;
  const docW = RIGHT - docX;
  const typeLines = documentType.split('\n').length;

  doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(16)
    .text(documentType, docX, 20, { width: docW, align: 'right' });

  // Position number below all type lines (~20pt de alto de línea a 16pt)
  const numY = 20 + typeLines * 20 + 4;
  doc.fillColor(TEAL).font('Helvetica').fontSize(10.5);
  textLine(doc, documentNumber, docX, numY, docW, { align: 'right' });

  // ── Separator line ────────────────────────────────────────────────────────
  doc.moveTo(LEFT, HEADER_H).lineTo(RIGHT, HEADER_H)
    .strokeColor('#cbd5e1').lineWidth(1.2).stroke();
}
