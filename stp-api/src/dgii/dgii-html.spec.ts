import { readFileSync } from 'fs';
import { join } from 'path';
import {
  decodeEntities,
  parseComprobantePage,
  parseRncPage,
  parseRncSearch,
  parseTimbrePage,
  titleCase,
} from './dgii-html';

/** Respuestas reales de la DGII capturadas el 2026-10-08 (ver fixtures/). */
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', `${name}.html`), 'utf8');

describe('dgii-html', () => {
  describe('RNC (respuestas reales)', () => {
    it('lee el contribuyente encontrado', () => {
      const r = parseRncPage(fixture('rnc-ok'), '101099161');
      expect(r.found).toBe(true);
      expect(r.rnc).toBe('101099161'); // la DGII lo manda como 101-09916-1
      expect(r.name).toBe('AMABLE ARISTY CASTRO S R L');
      expect(r.tradeName).toBe('AMABLE ARISTY CASTRO');
      expect(r.status).toBe('ACTIVO');
      expect(r.paymentScheme).toBe('NORMAL');
      expect(r.localAdmin).toBe('ADM LOCAL HIGUEY');
      expect(r.isElectronicBiller).toBe(true);
    });

    it('un RNC que no existe devuelve el mensaje de la DGII', () => {
      const r = parseRncPage(fixture('rnc-no'), '999999990');
      expect(r.found).toBe(false);
      expect(r.rnc).toBe('999999990');
      expect(r.message).toContain('no se encuentra inscrito como Contribuyente');
    });

    it('la búsqueda por nombre sin filas da una lista vacía', () => {
      expect(parseRncSearch(fixture('rnc-no'))).toEqual([]);
    });
  });

  describe('búsqueda por razón social', () => {
    it('extrae una fila por contribuyente', () => {
      const html = `
        <table>
          <tr class="TbRow"><td data-label="Cédula/RNC">1-30-99187-3</td><td data-label="Nombre/Razón Social">FERRETERIA UNO SRL</td>
            <td data-label="Nombre Comercial">FERRE UNO</td><td data-label="Estado">ACTIVO</td></tr>
          <tr class="TbRow"><td data-label="Cédula/RNC">101-00001-1</td><td data-label="Nombre/Razón Social">FERRETERIA DOS</td>
            <td data-label="Nombre Comercial"></td><td data-label="Estado">SUSPENDIDO</td></tr>
        </table>`;
      expect(parseRncSearch(html)).toEqual([
        { rnc: '130991873', name: 'FERRETERIA UNO SRL', tradeName: 'FERRE UNO', status: 'ACTIVO' },
        { rnc: '101000011', name: 'FERRETERIA DOS', tradeName: undefined, status: 'SUSPENDIDO' },
      ]);
    });
  });

  describe('comprobante (respuestas reales)', () => {
    it('NCF de papel vigente', () => {
      const r = parseComprobantePage(fixture('ncf-b01'), false);
      expect(r.verdict).toBe('valid');
      expect(r.estado).toBe('Vigente');
      expect(r.emisor).toBe('LUCAMI SRL');
      expect(r.tipo).toBe('FACTURA DE CRÉDITO FISCAL');
      expect(r.vigencia).toBe('31/12/2027');
      expect(r.message).toBe('El NCF digitado es válido.');
      expect(r.isEcf).toBe(false);
    });

    it('NCF que no corresponde al RNC', () => {
      const r = parseComprobantePage(fixture('ncf-falso'), false);
      expect(r.verdict).toBe('not-found');
      expect(r.estado).toBe('No encontrado');
      expect(r.message).toContain('no es correcto o no corresponde a este RNC');
    });

    it('un e-CF sin código de seguridad pide el dato en vez de dar un veredicto', () => {
      const r = parseComprobantePage(fixture('ncf-e31-con-comprador'), true);
      expect(r.verdict).toBe('needs-data');
      expect(r.estado).toBeNull();
      expect(r.message).toContain('Código de Seguridad');
      expect(r.message.startsWith('Para consultar')).toBe(true); // sin las comillas de la DGII
      expect(r.isEcf).toBe(true);
    });
  });

  describe('e-CF aceptado (HTML sintético: sin un código de seguridad real no se pudo capturar)', () => {
    const html = (estado: string) => `
      <span id="cphMain_lblRazonSocial">CENTRO CUESTA NACIONAL SAS</span>
      <span id="cphMain_lblEstadoFe">${estado}</span>
      <span id="cphMain_lblMontoTotal">1,500.00</span>
      <span id="cphMain_lblTotalItbis">228.81</span>
      <span id="cphMain_lblFechaEmision">05-10-2026</span>
      <span id="cphMain_lblInformacion"></span>`;

    it('Aceptado → válido, con monto e ITBIS', () => {
      const r = parseComprobantePage(html('Aceptado'), true);
      expect(r.verdict).toBe('valid');
      expect(r.estado).toBe('Aceptado');
      expect(r.montoTotal).toBe(1500);
      expect(r.itbis).toBe(228.81);
      expect(r.fechaEmision).toBe('05-10-2026');
    });

    it('Rechazado → rechazado, y el estado queda para guardarse', () => {
      const r = parseComprobantePage(html('RECHAZADO'), true);
      expect(r.verdict).toBe('rejected');
      expect(r.estado).toBe('Rechazado');
    });
  });

  describe('página del timbre de un e-CF', () => {
    it('"no fue encontrada" (respuestas reales de la DGII, factura de consumo y e-CF)', () => {
      expect(parseTimbrePage(fixture('timbre-no-encontrada-fc'))).toEqual({ notFound: true });
      expect(parseTimbrePage(fixture('timbre-no-encontrada-ecf'))).toEqual({ notFound: true });
    });

    // Sin un QR real no se pudo capturar la página de éxito: este HTML es SINTÉTICO y usa los
    // rótulos que FiscoRD leía en producción (82 facturas validadas con ellos).
    const exito = (estado: string) => `
      <table>
        <tr><th>RNC Emisor</th><td>101099161</td></tr>
        <tr><th>Razón social emisor</th><td>AMABLE ARISTY CASTRO S R L</td></tr>
        <tr><th>Estado</th><td>${estado}</td></tr>
        <tr><th>Total de ITBIS</th><td>RD$ 228.81</td></tr>
        <tr><th>Monto total</th><td>RD$ 1,500.00</td></tr>
        <tr><th>Fecha de emisión</th><td>05-10-2026</td></tr>
      </table>`;

    it('(sintético) lee emisor, estado, ITBIS y total', () => {
      expect(parseTimbrePage(exito('ACEPTADO'))).toEqual({
        notFound: false,
        supplierName: 'AMABLE ARISTY CASTRO S R L',
        estado: 'Aceptado',
        itbis: 228.81,
        total: 1500,
        fecha: '05-10-2026',
      });
    });

    it('(sintético) también lee el formato <td>etiqueta</td><td>valor</td>', () => {
      const html = '<tr><td>Estado</td><td>Rechazado</td></tr><tr><td>Monto Total</td><td>10.50</td></tr>';
      const r = parseTimbrePage(html);
      expect(r.estado).toBe('Rechazado');
      expect(r.total).toBe(10.5);
    });

    it('una página sin datos reconocibles no inventa nada', () => {
      expect(parseTimbrePage('<html><body>hola</body></html>')).toEqual({
        notFound: false,
        supplierName: undefined,
        estado: undefined,
        itbis: undefined,
        total: undefined,
        fecha: undefined,
      });
    });
  });

  it('una página irreconocible no da veredicto ni estado', () => {
    const r = parseComprobantePage('<html><body>otra cosa</body></html>', false);
    expect(r.verdict).toBe('unknown');
    expect(r.estado).toBeNull();
  });

  it('decodifica entidades numéricas y con nombre', () => {
    expect(decodeEntities('Raz&#243;n Social &amp; Cía &oacute;')).toBe('Razón Social & Cía ó');
    expect(decodeEntities('&desconocida;')).toBe('&desconocida;');
  });

  it('titleCase', () => {
    expect(titleCase('VIGENTE')).toBe('Vigente');
    expect(titleCase('')).toBe('');
  });
});
