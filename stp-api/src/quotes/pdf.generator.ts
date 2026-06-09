import { createWriteStream, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import PDFDocument from 'pdfkit';
import type { Quote } from './entities/quote.entity';
import { getUploadRoot } from '../files/files.utils';

function findLogoPath(): string | null {
  const brandDir = join(getUploadRoot(), 'brand');
  if (!existsSync(brandDir)) return null;
  try {
    const files = readdirSync(brandDir).filter((f) => /^logo\.(png|jpg|jpeg|webp)$/i.test(f));
    return files.length ? join(brandDir, files[0]) : null;
  } catch {
    return null;
  }
}

const DARK_BLUE = '#1a3c6e';
const MID_GRAY = '#6b7280';
const BORDER_GRAY = '#e5e7eb';
const DARK_TEXT = '#1f2937';
const LEFT = 50;
const RIGHT = 545;
const WIDTH = RIGHT - LEFT;

function money(n: number): string {
  const [int, dec] = (Math.round(n * 100) / 100).toFixed(2).split('.');
  return 'RD$ ' + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec;
}

function dateFmt(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d as string);
  if (isNaN(dt.getTime())) return '—';
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = dt.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function generateQuotePdf(quote: Quote, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: 'A4' });
    const stream = createWriteStream(outputPath);
    doc.pipe(stream);
    stream.on('error', reject);

    // ── Header bar ────────────────────────────────────────────────────────────
    doc.rect(0, 0, 595, 72).fill(DARK_BLUE);

    const logoPath = findLogoPath();
    if (logoPath) {
      try {
        doc.image(logoPath, LEFT, 10, { fit: [52, 52] });
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14)
          .text('Soluciones Técnicas Profesionales', LEFT + 60, 18, { width: 200, lineBreak: false });
        doc.fillColor('#a8c4e0').font('Helvetica').fontSize(9)
          .text('stpsoluciones.com', LEFT + 60, 38, { width: 200, lineBreak: false });
      } catch {
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16)
          .text('Soluciones Técnicas Profesionales', LEFT, 18, { width: 260, lineBreak: false });
        doc.fillColor('#a8c4e0').font('Helvetica').fontSize(9)
          .text('stpsoluciones.com', LEFT, 42, { width: 260, lineBreak: false });
      }
    } else {
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16)
        .text('Soluciones Técnicas Profesionales', LEFT, 18, { width: 260, lineBreak: false });
      doc.fillColor('#a8c4e0').font('Helvetica').fontSize(9)
        .text('stpsoluciones.com', LEFT, 42, { width: 260, lineBreak: false });
    }

    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22)
      .text('COTIZACIÓN', LEFT + 260, 13, { width: 235, align: 'right', lineBreak: false });
    doc.fillColor('#a8c4e0').font('Helvetica').fontSize(10)
      .text(quote.number, LEFT + 260, 41, { width: 235, align: 'right', lineBreak: false });

    // ── Client + metadata block ───────────────────────────────────────────────
    let y = 90;

    // Left column: client
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7.5)
      .text('CLIENTE', LEFT, y, { lineBreak: false });
    y += 11;
    doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(11)
      .text(quote.client?.name ?? '—', LEFT, y, { width: 240, lineBreak: false });
    y += 14;
    if (quote.client?.email) {
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(9)
        .text(quote.client.email, LEFT, y, { width: 240, lineBreak: false });
      y += 13;
    }

    // Right column: metadata
    const rcol = LEFT + 265;
    let ry = 90;

    const meta = (label: string, value: string) => {
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7.5)
        .text(label, rcol, ry, { width: 230, lineBreak: false });
      ry += 11;
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9)
        .text(value, rcol, ry, { width: 230, lineBreak: false });
      ry += 14;
    };

    meta('FECHA DE EMISIÓN', dateFmt(quote.createdAt));
    meta('VÁLIDA HASTA', dateFmt(quote.validUntil));
    if (quote.project) {
      meta('PROYECTO', `${quote.project.code} — ${quote.project.name}`);
    }

    y = Math.max(y, ry) + 10;

    // ── Quote title ───────────────────────────────────────────────────────────
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(BORDER_GRAY).lineWidth(1).stroke();
    y += 10;
    doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(12)
      .text(quote.title, LEFT, y, { width: WIDTH });
    y += doc.heightOfString(quote.title, { width: WIDTH }) + 8;
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(BORDER_GRAY).lineWidth(1).stroke();
    y += 12;

    // ── Items table ───────────────────────────────────────────────────────────
    const C = {
      desc: { x: LEFT, w: 200 },
      unit: { x: LEFT + 200, w: 45 },
      qty: { x: LEFT + 245, w: 40 },
      price: { x: LEFT + 285, w: 80 },
      disc: { x: LEFT + 365, w: 40 },
      total: { x: LEFT + 405, w: 90 },
    };

    // Header row
    doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(8);
    doc.text('Descripción', C.desc.x, y, { width: C.desc.w, lineBreak: false });
    doc.text('Unidad', C.unit.x, y, { width: C.unit.w, lineBreak: false });
    doc.text('Cant.', C.qty.x, y, { width: C.qty.w, align: 'right', lineBreak: false });
    doc.text('Precio unit.', C.price.x, y, { width: C.price.w, align: 'right', lineBreak: false });
    doc.text('Desc.', C.disc.x, y, { width: C.disc.w, align: 'right', lineBreak: false });
    doc.text('Total', C.total.x, y, { width: C.total.w, align: 'right', lineBreak: false });
    y += 13;
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(DARK_BLUE).lineWidth(0.5).stroke();
    y += 5;

    // Item rows
    doc.font('Helvetica').fontSize(9).fillColor(DARK_TEXT);
    for (const item of quote.items ?? []) {
      const descH = doc.heightOfString(item.description, { width: C.desc.w });
      const rowH = Math.max(descH + 4, 14);
      const disc = Number(item.discountPct ?? 0);

      doc.text(item.description, C.desc.x, y, { width: C.desc.w });
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(8)
        .text(item.unit ?? '', C.unit.x, y, { width: C.unit.w, lineBreak: false });
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9)
        .text(String(item.quantity), C.qty.x, y, { width: C.qty.w, align: 'right', lineBreak: false });
      doc.text(money(item.unitPrice), C.price.x, y, { width: C.price.w, align: 'right', lineBreak: false });
      doc.fillColor(disc > 0 ? MID_GRAY : DARK_TEXT).text(disc > 0 ? `${disc}%` : '—', C.disc.x, y, { width: C.disc.w, align: 'right', lineBreak: false });
      doc.fillColor(DARK_TEXT).text(money(item.total ?? item.quantity * item.unitPrice * (1 - disc / 100)), C.total.x, y, { width: C.total.w, align: 'right', lineBreak: false });

      y += rowH;
      doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(BORDER_GRAY).lineWidth(0.3).stroke();
      y += 4;
    }

    y += 8;

    // ── Totals ────────────────────────────────────────────────────────────────
    const tLabelX = C.price.x;
    const tLabelW = C.price.w + C.disc.w;
    const tValueX = C.total.x;
    const tValueW = C.total.w;

    const totRow = (label: string, value: string, bold = false) => {
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(9)
        .text(label, tLabelX, y, { width: tLabelW, lineBreak: false });
      doc.fillColor(bold ? DARK_BLUE : DARK_TEXT)
        .font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 9)
        .text(value, tValueX, y, { width: tValueW, align: 'right', lineBreak: false });
      y += bold ? 15 : 13;
    };

    doc.moveTo(tLabelX, y).lineTo(RIGHT, y).strokeColor(BORDER_GRAY).lineWidth(0.5).stroke();
    y += 5;
    totRow('Subtotal', money(quote.subtotal));
    if (quote.taxRate > 0) {
      totRow(`ITBIS (${quote.taxRate}%)`, money(quote.taxAmount));
    }
    doc.moveTo(tLabelX, y).lineTo(RIGHT, y).strokeColor(DARK_BLUE).lineWidth(0.5).stroke();
    y += 4;
    totRow('TOTAL', money(quote.total), true);

    // ── Notes ─────────────────────────────────────────────────────────────────
    if (quote.notes) {
      y += 18;
      doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(BORDER_GRAY).lineWidth(0.5).stroke();
      y += 10;
      doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(9)
        .text('Notas', LEFT, y, { lineBreak: false });
      y += 13;
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9)
        .text(quote.notes, LEFT, y, { width: WIDTH });
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    const footerY = 800;
    doc.moveTo(LEFT, footerY).lineTo(RIGHT, footerY).strokeColor(BORDER_GRAY).lineWidth(0.5).stroke();
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(8)
      .text(
        'Soluciones Técnicas Profesionales · República Dominicana · stpsoluciones.com',
        LEFT, footerY + 8, { width: WIDTH, align: 'center', lineBreak: false },
      );

    doc.end();
    stream.on('finish', resolve);
  });
}
