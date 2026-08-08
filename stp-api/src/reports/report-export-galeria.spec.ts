import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';
import { docToPdf, docToWorkbook } from './report-export';
import type { ExportDoc, ExportImage } from './report-tables';

/**
 * Registro fotográfico incrustado en el PDF.
 *
 * Las fotos se generan aquí con sharp en vez de guardar binarios en el repo: así
 * la prueba es reproducible y no añade peso al árbol.
 *
 * Lo que NO se comprueba aquí es la maquetación (que los pies no pisen la fecha,
 * que las filas no se solapen). Eso no se puede afirmar mirando bytes de un PDF:
 * se verifica rasterizando y mirando, con `pymupdf`. Este spec cubre lo que sí
 * es automatizable — que las fotos entren, que un formato que PDFKit no entiende
 * entre igual, y que un archivo roto no se lleve por delante el informe.
 */

const COMPANY = { name: 'STP' } as never;

let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'stp-galeria-'));
  await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 30, g: 90, b: 160 } } })
    .jpeg()
    .toFile(join(dir, 'a.jpg'));
  await sharp({ create: { width: 600, height: 900, channels: 3, background: { r: 160, g: 60, b: 30 } } })
    .jpeg()
    .toFile(join(dir, 'vertical.jpg'));
  // PDFKit no sabe incrustar WEBP: solo entra si se convierte antes.
  await sharp({ create: { width: 700, height: 500, channels: 3, background: { r: 30, g: 150, b: 90 } } })
    .webp()
    .toFile(join(dir, 'c.webp'));
  // Un archivo con extensión de imagen que no es una imagen.
  writeFileSync(join(dir, 'roto.jpg'), 'esto no es un JPEG');
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

function docConFotos(imagenes: ExportImage[]): ExportDoc {
  return {
    title: 'Informe de proyecto',
    filters: [],
    filename: 'informe',
    tables: [
      {
        name: 'Fotos',
        title: 'Registro fotográfico',
        columns: [{ header: 'Archivo' }, { header: 'Fecha', type: 'date' }],
        rows: imagenes.map((i) => [i.caption ?? '', i.sub ?? '']),
        vacio: 'Sin fotos registradas',
        imagenes,
      },
    ],
  };
}

describe('registro fotográfico en el PDF', () => {
  it('incrusta las fotos: el PDF pesa mucho más que el mismo informe sin ellas', async () => {
    const conFotos = await docToPdf(
      docConFotos([
        { path: join(dir, 'a.jpg'), caption: 'Fachada norte', sub: '08/08/2026' },
        { path: join(dir, 'vertical.jpg'), caption: 'Cuarto eléctrico', sub: '08/08/2026' },
      ]),
      COMPANY,
    );

    const sinFotos = await docToPdf(docConFotos([]), COMPANY);

    expect(conFotos.length).toBeGreaterThan(sinFotos.length + 5000);
    expect(conFotos.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('un WEBP entra en el informe (PDFKit no lo soporta: hay que convertirlo)', async () => {
    const soloWebp = await docToPdf(
      docConFotos([{ path: join(dir, 'c.webp'), caption: 'Tablero', sub: '08/08/2026' }]),
      COMPANY,
    );
    const sinFotos = await docToPdf(docConFotos([]), COMPANY);

    expect(soloWebp.length).toBeGreaterThan(sinFotos.length + 2000);
  });

  it('una foto que falta o está corrupta NO rompe el informe: sale sin ella', async () => {
    const doc = docConFotos([
      { path: join(dir, 'a.jpg'), caption: 'Buena', sub: '08/08/2026' },
      { path: join(dir, 'NO-EXISTE.jpg'), caption: 'Borrada', sub: '08/08/2026' },
      { path: join(dir, 'roto.jpg'), caption: 'Corrupta', sub: '08/08/2026' },
    ]);

    const buf = await docToPdf(doc, COMPANY);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    // La buena sí entró.
    const sinFotos = await docToPdf(docConFotos([]), COMPANY);
    expect(buf.length).toBeGreaterThan(sinFotos.length + 2000);
  });

  it('recomprime: 4 fotos grandes no producen un PDF descomunal', async () => {
    const grande = join(dir, 'grande.jpg');
    const w = 3000;
    const h = 2000;
    const raw = Buffer.alloc(w * h * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919) % 256;
    await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 95 }).toFile(grande);

    const buf = await docToPdf(
      docConFotos(
        Array.from({ length: 4 }, (_, i) => ({ path: grande, caption: `Foto ${i + 1}` })),
      ),
      COMPANY,
    );

    // Sin reescalar, cuatro fotos así se acercarían a los 20 MB.
    expect(buf.length).toBeLessThan(4 * 1024 * 1024);
  }, 60000);

  it('el Excel NO lleva imágenes: sigue saliendo de las filas de la tabla', () => {
    const wb = docToWorkbook(
      docConFotos([{ path: join(dir, 'a.jpg'), caption: 'Fachada norte', sub: '08/08/2026' }]),
    );
    // ExcelJS expone las imágenes del libro; aquí no debe haber ninguna.
    expect(wb.model.media ?? []).toHaveLength(0);
    expect(wb.worksheets).toHaveLength(1);
  });
});
