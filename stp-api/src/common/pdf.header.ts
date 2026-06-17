import type PDFDocument from 'pdfkit';
import { COMPANY } from './company';

const DARK_BLUE = '#1a3c6e';
const LIGHT_BLUE = '#a8c4e0';
const LEFT = 50;
export const HEADER_H = 100;
export const CONTENT_Y = HEADER_H + 20;

/**
 * Draws the unified company header on the PDF document.
 * Returns the y position where document-specific content should begin.
 */
export function drawDocumentHeader(
  doc: InstanceType<typeof PDFDocument>,
  documentType: string,
  documentNumber: string,
  logoPath: string | null,
): void {
  doc.rect(0, 0, 595, HEADER_H).fill(DARK_BLUE);

  const textX = LEFT + 65;
  const rightX = LEFT + 265;
  const rightW = 595 - LEFT - rightX + LEFT;

  // ── Logo ──────────────────────────────────────────────────────────────────
  if (logoPath) {
    try {
      doc.image(logoPath, LEFT, 14, { fit: [56, 56] });
    } catch {
      // logo load error is non-fatal
    }
  }

  // ── Left column: company info ──────────────────────────────────────────────
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(13)
    .text(COMPANY.name, textX, 17, { width: 210, lineBreak: false });

  doc.fillColor(LIGHT_BLUE).font('Helvetica').fontSize(8)
    .text(`RNC ${COMPANY.rnc}  ·  ${COMPANY.website}`, textX, 34, { width: 210, lineBreak: false });

  doc.fillColor(LIGHT_BLUE).font('Helvetica').fontSize(7.5)
    .text(COMPANY.address, textX, 46, { width: 210, lineBreak: false });

  doc.fillColor(LIGHT_BLUE).font('Helvetica').fontSize(7.5)
    .text(`Tel: ${COMPANY.phones}`, textX, 57, { width: 210, lineBreak: false });

  // ── Right column: document type + number ──────────────────────────────────
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20)
    .text(documentType, rightX, 18, { width: rightW, align: 'right', lineBreak: false });

  doc.fillColor(LIGHT_BLUE).font('Helvetica').fontSize(10)
    .text(documentNumber, rightX, 44, { width: rightW, align: 'right', lineBreak: false });
}
