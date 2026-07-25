import { createWriteStream } from 'fs';
import PDFDocument from 'pdfkit';
import type { Quote } from './entities/quote.entity';
import { findLogoPath } from '../common/logo.utils';
import {
  drawDocumentHeader, CONTENT_Y,
  DARK_BLUE, TEAL, MID_GRAY, DARK_TEXT, BORDER_GRAY, LEFT, RIGHT, WIDTH,
} from '../common/pdf.header';
import type { CompanyData } from '../common/company';

// ── Additional palette ─────────────────────────────────────────────────────
const TABLE_HDR_BG = '#dbeafe';
const SECTION_BG   = '#f1f5f9';
const INFO_BG      = '#f8fafc';

// ── Helpers ────────────────────────────────────────────────────────────────

function money(n: number): string {
  const [int, dec] = (Math.round(n * 100) / 100).toFixed(2).split('.');
  return 'RD$ ' + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec;
}

const MONTHS_ES = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre',
];

function dateLong(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d as string);
  if (isNaN(dt.getTime())) return '—';
  return `${dt.getUTCDate()} de ${MONTHS_ES[dt.getUTCMonth()]}, ${dt.getUTCFullYear()}`;
}

function dateFmt(d: Date | null | undefined): string {
  if (!d) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// ── Main generator ─────────────────────────────────────────────────────────

export function generateQuotePdf(quote: Quote, outputPath: string, company: CompanyData): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: 'A4', autoFirstPage: true });
    const stream = createWriteStream(outputPath);
    doc.pipe(stream);
    stream.on('error', reject);

    const logoPath    = findLogoPath();
    // Número mostrado en el encabezado: en revisiones (rev>1) se muestra el
    // número base con la etiqueta "Rev. N" para el cliente.
    const displayNumber = (quote.revision ?? 1) > 1
      ? `${quote.baseNumber} · Rev. ${quote.revision}`
      : quote.number;
    const hasIndirect = Array.isArray(quote.indirectCosts) && quote.indirectCosts.length > 0;
    // Con gastos indirectos, el ITBIS ya no se prorratea por ítem.
    const showITBIS   = !hasIndirect && (quote.taxRate ?? 0) > 0;

    // ── Column layout ──────────────────────────────────────────────────────
    const C = showITBIS
      ? {
          desc:  { x: LEFT,        w: 170 },
          qty:   { x: LEFT + 170,  w: 30  },
          unit:  { x: LEFT + 200,  w: 42  },
          price: { x: LEFT + 242,  w: 78  },
          disc:  { x: LEFT + 320,  w: 35  },
          itbis: { x: LEFT + 355,  w: 65  },
          total: { x: LEFT + 420,  w: 75  },
        }
      : {
          desc:  { x: LEFT,        w: 210 },
          qty:   { x: LEFT + 210,  w: 35  },
          unit:  { x: LEFT + 245,  w: 50  },
          price: { x: LEFT + 295,  w: 85  },
          disc:  { x: LEFT + 380,  w: 40  },
          itbis: null as null,
          total: { x: LEFT + 420,  w: 75  },
        };

    // ── Helper: check page break and add new page if needed ────────────────
    const newPage = (): number => {
      doc.addPage();
      drawDocumentHeader(doc, 'COTIZACIÓN', displayNumber, logoPath, company);
      return CONTENT_Y;
    };

    const checkBreak = (y: number, needed: number): number =>
      y + needed > 758 ? newPage() : y;

    // ── PAGE 1: Header ─────────────────────────────────────────────────────
    drawDocumentHeader(doc, 'COTIZACIÓN', displayNumber, logoPath, company);
    let y = CONTENT_Y;

    // ── Client info block ──────────────────────────────────────────────────
    const COL1 = LEFT + 14;
    const COL2 = LEFT + 268;
    const BLOCK_H = 74;

    doc.rect(LEFT, y, WIDTH, BLOCK_H).fill(INFO_BG);
    doc.rect(LEFT, y, 4, BLOCK_H).fill(TEAL);

    // Row 1 — CLIENTE / CONTACTO
    const r1Y = y + 8;
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7)
      .text('CLIENTE', COL1, r1Y, { lineBreak: false })
      .text('CONTACTO', COL2, r1Y, { lineBreak: false });

    doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(8.5)
      .text(quote.client?.name ?? '—', COL1, r1Y + 9, { width: 222, lineBreak: false });

    if ((quote.client as any)?.rnc) {
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7)
        .text(`RNC/Cédula: ${(quote.client as any).rnc}`, COL1, r1Y + 21, { width: 222, lineBreak: false });
    }

    let ctY = r1Y + 9;
    if (quote.client?.email) {
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(7.5)
        .text(quote.client.email, COL2, ctY, { width: 222, lineBreak: false });
      ctY += 11;
    }
    if ((quote.client as any)?.phone) {
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7)
        .text(`Tel: ${(quote.client as any).phone}`, COL2, ctY, { width: 222, lineBreak: false });
    }

    // Divider inside block
    const divY = y + 40;
    doc.moveTo(COL1, divY).lineTo(RIGHT - 14, divY)
      .strokeColor('#e2e8f0').lineWidth(0.5).stroke();

    // Row 2 — FECHA / VÁLIDA HASTA
    const r2Y = divY + 6;
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7)
      .text('FECHA DE EMISIÓN', COL1, r2Y, { lineBreak: false })
      .text('VÁLIDA HASTA',     COL2, r2Y, { lineBreak: false });
    doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(8.5)
      .text(dateLong(quote.createdAt),  COL1, r2Y + 9, { width: 222, lineBreak: false })
      .text(dateLong(quote.validUntil), COL2, r2Y + 9, { width: 222, lineBreak: false });

    y += BLOCK_H + 12;

    // ── Quote title + project ──────────────────────────────────────────────
    doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(12)
      .text(quote.title, LEFT, y, { width: WIDTH });
    y += doc.heightOfString(quote.title, { width: WIDTH }) + 6;

    if (quote.project) {
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(8.5)
        .text(`Proyecto: ${quote.project.code} — ${quote.project.name}`, LEFT, y, { lineBreak: false });
      y += 12;
    }
    y += 8;

    // ── Sections ───────────────────────────────────────────────────────────
    const items = quote.items ?? [];
    const sectionNames = [...new Set(items.map((i) => i.sectionName ?? ''))];

    let sIdx = 0;
    for (const sectionName of sectionNames) {
      const sectionItems = items.filter((i) => (i.sectionName ?? '') === sectionName);
      sIdx++;

      y = checkBreak(y, 70);

      // Section header bar
      const sLabel = sectionName
        ? `PARTIDA ${sIdx}: ${sectionName.toUpperCase()}`
        : `PARTIDA ${sIdx}`;
      doc.rect(LEFT, y, WIDTH, 18).fill(SECTION_BG);
      doc.rect(LEFT, y, 4,     18).fill(TEAL);
      doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(8.5)
        .text(sLabel, LEFT + 8, y + 5, { width: WIDTH - 16, lineBreak: false });
      y += 20;

      // Table header row
      doc.rect(LEFT, y, WIDTH, 17).fill(TABLE_HDR_BG);
      doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(7.5);
      doc.text('Descripción',  C.desc.x + 3,  y + 5, { width: C.desc.w - 6,  lineBreak: false });
      doc.text('Cant.',        C.qty.x,        y + 5, { width: C.qty.w,        align: 'right', lineBreak: false });
      doc.text('Unidad',       C.unit.x + 2,   y + 5, { width: C.unit.w - 2,  lineBreak: false });
      doc.text('Precio Unit.', C.price.x,      y + 5, { width: C.price.w,     align: 'right', lineBreak: false });
      doc.text('Desc.%',       C.disc.x,       y + 5, { width: C.disc.w,      align: 'right', lineBreak: false });
      if (C.itbis) {
        doc.text(`ITBIS (${quote.taxRate}%)`, C.itbis.x, y + 5, { width: C.itbis.w, align: 'right', lineBreak: false });
      }
      doc.text('Total', C.total.x, y + 5, { width: C.total.w, align: 'right', lineBreak: false });
      y += 19;

      // Item rows
      for (const item of sectionItems) {
        const disc   = Number(item.discountPct ?? 0);
        const iTotal = Number(item.total ?? item.quantity * item.unitPrice * (1 - disc / 100));
        const iITBIS = showITBIS ? iTotal * ((quote.taxRate ?? 0) / 100) : 0;

        const descH = doc.font('Helvetica').fontSize(8.5)
          .heightOfString(item.description, { width: C.desc.w - 6 });
        const rowH  = Math.max(descH + 8, 20);

        y = checkBreak(y, rowH + 6);

        // If we just added a page, re-draw the table header
        if (y === CONTENT_Y) {
          doc.rect(LEFT, y, WIDTH, 17).fill(TABLE_HDR_BG);
          doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(7.5);
          doc.text('Descripción',  C.desc.x + 3,  y + 5, { width: C.desc.w - 6,  lineBreak: false });
          doc.text('Cant.',        C.qty.x,        y + 5, { width: C.qty.w,        align: 'right', lineBreak: false });
          doc.text('Unidad',       C.unit.x + 2,   y + 5, { width: C.unit.w - 2,  lineBreak: false });
          doc.text('Precio Unit.', C.price.x,      y + 5, { width: C.price.w,     align: 'right', lineBreak: false });
          doc.text('Desc.%',       C.disc.x,       y + 5, { width: C.disc.w,      align: 'right', lineBreak: false });
          if (C.itbis) {
            doc.text(`ITBIS (${quote.taxRate}%)`, C.itbis.x, y + 5, { width: C.itbis.w, align: 'right', lineBreak: false });
          }
          doc.text('Total', C.total.x, y + 5, { width: C.total.w, align: 'right', lineBreak: false });
          y += 19;
        }

        const midY = y + rowH / 2 - 5;

        doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(8.5)
          .text(item.description, C.desc.x + 3, y + 4, { width: C.desc.w - 6 });
        doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(8.5)
          .text(String(item.quantity), C.qty.x, midY, { width: C.qty.w, align: 'right', lineBreak: false });
        doc.fillColor(MID_GRAY).font('Helvetica').fontSize(8)
          .text(item.unit ?? '—', C.unit.x + 2, midY, { width: C.unit.w - 2, lineBreak: false });
        doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(8.5)
          .text(money(item.unitPrice), C.price.x, midY, { width: C.price.w, align: 'right', lineBreak: false });
        doc.fillColor(disc > 0 ? TEAL : MID_GRAY).font('Helvetica').fontSize(8)
          .text(disc > 0 ? `${disc}%` : '—', C.disc.x, midY, { width: C.disc.w, align: 'right', lineBreak: false });
        if (C.itbis) {
          doc.fillColor(MID_GRAY).font('Helvetica').fontSize(8)
            .text(money(iITBIS), C.itbis.x, midY, { width: C.itbis.w, align: 'right', lineBreak: false });
        }
        doc.fillColor(DARK_TEXT).font('Helvetica-Bold').fontSize(8.5)
          .text(money(iTotal), C.total.x, midY, { width: C.total.w, align: 'right', lineBreak: false });

        y += rowH;
        doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(BORDER_GRAY).lineWidth(0.3).stroke();
        y += 2;
      }

      y += 10;
    }

    // ── Totals ─────────────────────────────────────────────────────────────
    y = checkBreak(y, 80);

    const tLabelX = C.price.x;
    const tLabelW = C.price.w + C.disc.w + (C.itbis?.w ?? 0);
    const tValueX = C.total.x;
    const tValueW = C.total.w;

    doc.moveTo(tLabelX, y).lineTo(RIGHT, y).strokeColor(BORDER_GRAY).lineWidth(0.5).stroke();
    y += 7;

    const subtotalLabel = hasIndirect ? 'Subtotal costos directos' : 'Subtotal';
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(9)
      .text(subtotalLabel, tLabelX, y, { width: tLabelW, lineBreak: false });
    doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9)
      .text(money(quote.subtotal), tValueX, y, { width: tValueW, align: 'right', lineBreak: false });
    y += 14;

    if (Number(quote.discount ?? 0) > 0) {
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(9)
        .text('Descuento', tLabelX, y, { width: tLabelW, lineBreak: false });
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9)
        .text('- ' + money(Number(quote.discount)), tValueX, y, { width: tValueW, align: 'right', lineBreak: false });
      y += 14;
    }

    if (hasIndirect) {
      // ── Desglose de gastos indirectos ──────────────────────────────────────
      y += 2;
      doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(8)
        .text('GASTOS INDIRECTOS', tLabelX, y, { width: tLabelW + tValueW, lineBreak: false });
      y += 13;
      for (const cost of quote.indirectCosts) {
        y = checkBreak(y, 14);
        const pctLabel = cost.kind === 'itbis'
          ? `${cost.name} (${cost.pct}% Dir. Técnica)`
          : `${cost.name} (${cost.pct}%)`;
        doc.fillColor(MID_GRAY).font('Helvetica').fontSize(8.5)
          .text(pctLabel, tLabelX, y, { width: tLabelW, lineBreak: false });
        doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(8.5)
          .text(money(Number(cost.amount ?? 0)), tValueX, y, { width: tValueW, align: 'right', lineBreak: false });
        y += 13;
      }
      y += 1;
    }

    if (showITBIS) {
      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(9)
        .text(`ITBIS (${quote.taxRate}%)`, tLabelX, y, { width: tLabelW, lineBreak: false });
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9)
        .text(money(quote.taxAmount), tValueX, y, { width: tValueW, align: 'right', lineBreak: false });
      y += 14;
    }

    doc.moveTo(tLabelX, y).lineTo(RIGHT, y).strokeColor(TEAL).lineWidth(0.8).stroke();
    y += 6;

    doc.fillColor(MID_GRAY).font('Helvetica-Bold').fontSize(9)
      .text('TOTAL NETO', tLabelX, y, { width: tLabelW, lineBreak: false });
    doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(10.5)
      .text(money(quote.total), tValueX, y - 1, { width: tValueW, align: 'right', lineBreak: false });
    y += 18;

    // ── Notes ──────────────────────────────────────────────────────────────
    if (quote.notes) {
      y = checkBreak(y, 40);
      y += 6;
      doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(BORDER_GRAY).lineWidth(0.5).stroke();
      y += 10;
      doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(9).text('NOTAS', LEFT, y);
      y += 13;
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(9)
        .text(quote.notes, LEFT, y, { width: WIDTH });
      y += doc.heightOfString(quote.notes, { width: WIDTH }) + 8;
    }

    // ── Terms & Conditions ──────────────────────────────────────────────────
    const termsText = quote.terms as string | null | undefined;
    if (termsText) {
      y = checkBreak(y, 50);
      y += 10;
      doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(BORDER_GRAY).lineWidth(0.5).stroke();
      y += 12;
      doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(9.5)
        .text('TÉRMINOS Y CONDICIONES', LEFT, y);
      y += 16;
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(8.5)
        .text(termsText, LEFT, y, { width: WIDTH });
      y += doc.heightOfString(termsText, { width: WIDTH }) + 14;
    }

    // ── Signature section — always anchored to bottom of last page ─────────
    // Total height consumed by sig block below this point: ~112pt
    const SIG_ANCHOR = 730;
    if (y > SIG_ANCHOR - 10) {
      // Content reached the signature zone — start a fresh page
      y = newPage();
    }
    y = SIG_ANCHOR;

    doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(BORDER_GRAY).lineWidth(0.5).stroke();
    y += 16;

    // Two signature columns, evenly split across the page
    const SIGW  = 160;
    const halfW = WIDTH / 2;
    const SIG1  = LEFT + (halfW / 2) - (SIGW / 2);
    const SIG2  = LEFT + halfW + (halfW / 2) - (SIGW / 2);

    const authorizedName = quote.createdBy
      ? `${(quote.createdBy as any).firstName ?? ''} ${(quote.createdBy as any).lastName ?? ''}`.trim()
      : 'Firma Autorizada';

    // Labels
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7.5)
      .text('Firma Autorizado', SIG1, y, { width: SIGW, align: 'center', lineBreak: false })
      .text('Firma Cliente',    SIG2, y, { width: SIGW, align: 'center', lineBreak: false });

    // Signature lines
    y += 34;
    doc.moveTo(SIG1, y).lineTo(SIG1 + SIGW, y).strokeColor('#94a3b8').lineWidth(0.5).stroke();
    doc.moveTo(SIG2, y).lineTo(SIG2 + SIGW, y).strokeColor('#94a3b8').lineWidth(0.5).stroke();
    y += 7;

    // Names below lines
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7)
      .text(authorizedName,     SIG1, y, { width: SIGW, align: 'center', lineBreak: false })
      .text('Recibido conforme', SIG2, y, { width: SIGW, align: 'center', lineBreak: false });
    y += 18;

    // ── Footer line ────────────────────────────────────────────────────────
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(BORDER_GRAY).lineWidth(0.5).stroke();
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7)
      .text(
        `${company.name}  ·  RNC: ${company.rnc}  ·  ${company.email}  ·  ${company.website}`,
        LEFT, y + 7, { width: WIDTH, align: 'center', lineBreak: false },
      );


    doc.end();
    stream.on('finish', resolve);
  });
}
