#!/usr/bin/env node
/**
 * Genera el Manual del Usuario del ERP en PDF.
 *
 * Vive en el repo, y no como un documento suelto, para que el manual se pueda
 * REGENERAR cuando el ERP cambie: un manual que se escribe una vez y se guarda
 * en una carpeta envejece en silencio hasta que dice cosas falsas.
 *
 * Usa PDFKit desde stp-api/node_modules y las mismas tintas y tipografías que
 * las cotizaciones y los recibos, para que se reconozca como material de STP.
 *
 *   node scripts/manual-usuario.js [ruta-de-salida.pdf]
 */

const fs = require('fs');
const path = require('path');

const PDFDocument = require(path.join(__dirname, '..', 'stp-api', 'node_modules', 'pdfkit'));
const { CONTENIDO, VERSION } = require('./manual-contenido');

// ── Identidad ────────────────────────────────────────────────────────────────
const NAVY = '#0D3773';
const NAVY_OSC = '#07204A';
const VERDE = '#14704F';
const VERDE_CLARO = '#E7F1EC';
const GRIS = '#55606B';
const GRIS_CLARO = '#8B949D';
const LINEA = '#D9DDD5';
const PAPEL = '#F4F5F2';

const IZQ = 56;
const DER = 539;
const ANCHO = DER - IZQ;
const TOPE = 64;
const PIE = 762;

/**
 * El mismo logo que llevan las cotizaciones y los recibos: el manual tiene que
 * parecer parte del mismo juego de documentos. Se busca donde lo busca el ERP
 * (uploads/brand), con el del repositorio como respaldo.
 */
function rutaLogo() {
  const candidatos = [
    '/storage/erp-uploads/brand/logo.jpg',
    '/storage/erp-uploads/brand/logo.png',
    path.join(__dirname, '..', 'stp-api', 'src', 'assets', 'Logo png.png'),
  ];
  return candidatos.find((c) => fs.existsSync(c)) || null;
}
const LOGO = rutaLogo();

function crear(salida) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    bufferPages: true, // hace falta para volver al índice y escribir los números
    info: {
      Title: 'Manual del Usuario — ERP STP',
      Author: 'Soluciones Técnicas Profesionales',
      Subject: 'Guía de uso del sistema de gestión de STP',
    },
  });
  doc.pipe(fs.createWriteStream(salida));
  return doc;
}

// ── Estado del recorrido ─────────────────────────────────────────────────────
let y = TOPE;
let paginaActual = 1;
const indice = []; // { titulo, nivel, pagina }
let paginaIndice = null;

function nuevaPagina(doc) {
  doc.addPage();
  paginaActual += 1;
  y = TOPE;
}

/** Reserva sitio: si el bloque no cabe entero, empieza en la página siguiente. */
function asegurar(doc, alto) {
  if (y + alto > PIE - 26) nuevaPagina(doc);
}

// ── Bloques ──────────────────────────────────────────────────────────────────

function portada(doc) {
  // Fondo blanco, no papel: el logo oficial viene sobre blanco y así no dibuja
  // un recuadro. La banda de color va abajo, donde no compite con la marca.
  doc.rect(0, 0, 595, 842).fill('#FFFFFF');

  if (LOGO) doc.image(LOGO, IZQ, 74, { width: 215 });

  doc.moveTo(IZQ, 250).lineTo(IZQ + 64, 250).lineWidth(3).strokeColor(VERDE).stroke();

  doc.fillColor(VERDE).font('Helvetica-Bold').fontSize(8.5)
    .text('MANUAL DEL USUARIO', IZQ, 282, { characterSpacing: 2.4 });

  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(33)
    .text('Sistema de gestión', IZQ, 306, { width: ANCHO })
    .text('de STP', IZQ, 345, { width: ANCHO });

  doc.fillColor(GRIS).font('Helvetica').fontSize(11.5)
    .text(
      'Guía completa para trabajar con clientes, cotizaciones, proyectos, costos, ' +
      'finanzas y nómina en el sistema de Soluciones Técnicas Profesionales.',
      IZQ, 404, { width: 396, lineGap: 3.5 },
    );

  // Banda inferior con los datos del documento.
  doc.rect(0, 700, 595, 142).fill(NAVY_OSC);
  doc.fillColor('#7FCBAA').font('Helvetica-Bold').fontSize(7.6)
    .text(`VERSIÓN ${VERSION.toUpperCase()}`, IZQ, 736, { characterSpacing: 1.6 });
  doc.fillColor('#FFFFFF').font('Helvetica').fontSize(9.5)
    .text('Soluciones Técnicas Profesionales · RNC 132943058', IZQ, 758)
    .text('Documento de uso interno', IZQ, 774);
}

function paginaDeIndice(doc) {
  nuevaPagina(doc);
  paginaIndice = paginaActual;
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(22).text('Contenido', IZQ, TOPE);
  doc.moveTo(IZQ, TOPE + 34).lineTo(IZQ + 48, TOPE + 34).lineWidth(2.5).strokeColor(VERDE).stroke();
  // Se rellena al final, cuando se sabe en qué página cayó cada sección.
}

function h1(doc, texto) {
  nuevaPagina(doc);
  indice.push({ titulo: texto, nivel: 1, pagina: paginaActual });

  doc.rect(IZQ, y, ANCHO, 46).fill(NAVY_OSC);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(17)
    .text(texto, IZQ + 16, y + 14, { width: ANCHO - 32, lineBreak: false });
  y += 46 + 26;
}

function h2(doc, texto) {
  asegurar(doc, 64);
  indice.push({ titulo: texto, nivel: 2, pagina: paginaActual });

  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(13).text(texto, IZQ, y, { width: ANCHO });
  y += doc.heightOfString(texto, { width: ANCHO }) + 5;
  doc.moveTo(IZQ, y).lineTo(IZQ + 34, y).lineWidth(2).strokeColor(VERDE).stroke();
  y += 13;
}

function h3(doc, texto) {
  asegurar(doc, 40);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10.5).text(texto, IZQ, y, { width: ANCHO });
  y += doc.heightOfString(texto, { width: ANCHO }) + 7;
}

function p(doc, texto) {
  doc.font('Helvetica').fontSize(9.8);
  const alto = doc.heightOfString(texto, { width: ANCHO, lineGap: 2.2 });
  asegurar(doc, alto);
  doc.fillColor('#25303F').text(texto, IZQ, y, { width: ANCHO, lineGap: 2.2, align: 'justify' });
  y += alto + 10;
}

function lista(doc, items, ordenada = false) {
  doc.font('Helvetica').fontSize(9.8);
  items.forEach((item, i) => {
    const marca = ordenada ? `${i + 1}.` : '•';
    const sangria = ordenada ? 20 : 14;
    const ancho = ANCHO - sangria;
    const alto = doc.heightOfString(item, { width: ancho, lineGap: 2 });
    asegurar(doc, alto + 4);
    doc.fillColor(ordenada ? VERDE : GRIS_CLARO).font(ordenada ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(ordenada ? 9.5 : 11)
      .text(marca, IZQ + 2, y + (ordenada ? 0.5 : -1.5), { width: sangria, lineBreak: false });
    doc.fillColor('#25303F').font('Helvetica').fontSize(9.8)
      .text(item, IZQ + sangria, y, { width: ancho, lineGap: 2 });
    y += alto + 5;
  });
  y += 6;
}

/** Aviso destacado. `tipo`: 'nota' (verde) o 'ojo' (ámbar). */
function nota(doc, texto, tipo = 'nota') {
  const acento = tipo === 'ojo' ? '#B4690E' : VERDE;
  const fondo = tipo === 'ojo' ? '#FCF4E8' : VERDE_CLARO;
  const rotulo = tipo === 'ojo' ? 'OJO' : 'NOTA';

  doc.font('Helvetica').fontSize(9.3);
  const altoTexto = doc.heightOfString(texto, { width: ANCHO - 34, lineGap: 2 });
  const alto = altoTexto + 34;
  asegurar(doc, alto);

  doc.rect(IZQ, y, ANCHO, alto).fill(fondo);
  doc.rect(IZQ, y, 3.5, alto).fill(acento);
  doc.fillColor(acento).font('Helvetica-Bold').fontSize(7.4)
    .text(rotulo, IZQ + 16, y + 11, { characterSpacing: 1.4, lineBreak: false });
  doc.fillColor('#25303F').font('Helvetica').fontSize(9.3)
    .text(texto, IZQ + 16, y + 22, { width: ANCHO - 34, lineGap: 2 });
  y += alto + 12;
}

function tabla(doc, cabeceras, filas, anchos) {
  const total = anchos.reduce((a, b) => a + b, 0);
  const cols = anchos.map((a) => (a / total) * ANCHO);
  const ALTO_CAB = 22;

  const dibujarCabecera = () => {
    doc.rect(IZQ, y, ANCHO, ALTO_CAB).fill(NAVY);
    let x = IZQ;
    cabeceras.forEach((c, i) => {
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.2)
        .text(c, x + 7, y + 7, { width: cols[i] - 14, lineBreak: false });
      x += cols[i];
    });
    y += ALTO_CAB;
  };

  asegurar(doc, ALTO_CAB + 40);
  dibujarCabecera();

  filas.forEach((fila, idx) => {
    doc.font('Helvetica').fontSize(8.8);
    const alto = Math.max(
      ...fila.map((celda, i) => doc.heightOfString(String(celda), { width: cols[i] - 14, lineGap: 1.5 })),
    ) + 12;

    if (y + alto > PIE - 26) {
      nuevaPagina(doc);
      dibujarCabecera();
    }

    if (idx % 2 === 1) doc.rect(IZQ, y, ANCHO, alto).fill('#FAFBF9');
    let x = IZQ;
    fila.forEach((celda, i) => {
      doc.fillColor(i === 0 ? NAVY_OSC : '#25303F')
        .font(i === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.8)
        .text(String(celda), x + 7, y + 6, { width: cols[i] - 14, lineGap: 1.5 });
      x += cols[i];
    });
    doc.moveTo(IZQ, y + alto).lineTo(DER, y + alto).lineWidth(0.4).strokeColor(LINEA).stroke();
    y += alto;
  });
  y += 14;
}

/** Camino dentro de la aplicación: Menú › Sección › Botón. */
function ruta(doc, texto) {
  doc.font('Courier-Bold').fontSize(8.6);
  const alto = doc.heightOfString(texto, { width: ANCHO - 20 }) + 14;
  asegurar(doc, alto);
  doc.rect(IZQ, y, ANCHO, alto).fill('#F1F3F6');
  doc.fillColor(NAVY).font('Courier-Bold').fontSize(8.6)
    .text(texto, IZQ + 10, y + 7, { width: ANCHO - 20 });
  y += alto + 11;
}

// ── Índice y pies, una vez conocido el total ─────────────────────────────────

function rellenarIndice(doc) {
  doc.switchToPage(paginaIndice - 1);
  let yy = TOPE + 56;

  indice.forEach((e) => {
    if (yy > PIE - 30) return; // el índice cabe en una página; si creciera, se vería aquí
    const sangria = e.nivel === 2 ? 16 : 0;
    const fuente = e.nivel === 1 ? 'Helvetica-Bold' : 'Helvetica';
    const cuerpo = e.nivel === 1 ? 10 : 9.3;
    const color = e.nivel === 1 ? NAVY : GRIS;

    doc.fillColor(color).font(fuente).fontSize(cuerpo)
      .text(e.titulo, IZQ + sangria, yy, { width: ANCHO - 40 - sangria, lineBreak: false });

    const anchoTitulo = doc.widthOfString(e.titulo);
    const desde = IZQ + sangria + anchoTitulo + 6;
    const hasta = DER - 22;
    if (hasta > desde) {
      doc.moveTo(desde, yy + 7).lineTo(hasta, yy + 7)
        .lineWidth(0.4).dash(1, { space: 2.5 }).strokeColor(LINEA).stroke().undash();
    }
    doc.fillColor(color).font(fuente).fontSize(cuerpo)
      .text(String(e.pagina), DER - 18, yy, { width: 18, align: 'right', lineBreak: false });

    yy += e.nivel === 1 ? 19 : 15;
  });
}

function pies(doc) {
  const total = doc.bufferedPageRange().count;
  for (let i = 1; i < total; i += 1) { // la portada no lleva pie
    doc.switchToPage(i);
    doc.moveTo(IZQ, PIE).lineTo(DER, PIE).lineWidth(0.4).strokeColor(LINEA).stroke();
    doc.fillColor(GRIS_CLARO).font('Helvetica').fontSize(7.4)
      .text('Manual del Usuario · ERP STP', IZQ, PIE + 8, { lineBreak: false })
      .text(`${i + 1}`, DER - 30, PIE + 8, { width: 30, align: 'right', lineBreak: false });
  }
}

// ── Recorrido ────────────────────────────────────────────────────────────────

function main() {
  const salida = process.argv[2] || path.join(__dirname, 'Manual del Usuario - ERP STP.pdf');
  const doc = crear(salida);

  portada(doc);
  paginaDeIndice(doc);

  const render = {
    h1: (v) => h1(doc, v),
    h2: (v) => h2(doc, v),
    h3: (v) => h3(doc, v),
    p: (v) => p(doc, v),
    lista: (v) => lista(doc, v, false),
    pasos: (v) => lista(doc, v, true),
    nota: (v) => nota(doc, v, 'nota'),
    ojo: (v) => nota(doc, v, 'ojo'),
    ruta: (v) => ruta(doc, v),
    tabla: (v) => tabla(doc, v.cabeceras, v.filas, v.anchos),
  };

  CONTENIDO.forEach((bloque) => {
    const [tipo, valor] = Object.entries(bloque)[0];
    if (!render[tipo]) throw new Error(`Bloque desconocido en el contenido: ${tipo}`);
    render[tipo](valor);
  });

  rellenarIndice(doc);
  pies(doc);

  doc.end();
  doc.on('end', () => {});
  return salida;
}

const salida = main();
process.on('exit', () => {
  if (fs.existsSync(salida)) {
    const kb = Math.round(fs.statSync(salida).size / 1024);
    console.log(`Manual generado: ${salida} (${kb} KB, ${paginaActual} páginas, ${indice.length} entradas de índice)`);
  }
});
