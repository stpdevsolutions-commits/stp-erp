import { QrParseError, dgiiDateToIso, isDgiiUrl, parseDgiiQr } from './qr-ecf';

const QR =
  'https://ecf.dgii.gov.do/ecf/ConsultaTimbre?RncEmisor=101099161&RncComprador=132943058&ENCF=E310000726627' +
  '&FechaEmision=05-10-2026&MontoTotal=1500.00&FechaFirma=05-10-2026%2019:42:10&CodigoSeguridad=K9m2Xq';

describe('qr-ecf', () => {
  describe('parseDgiiQr — un e-CF normal', () => {
    it('saca todos los datos de la dirección del QR', () => {
      expect(parseDgiiQr(QR)).toEqual({
        url: QR,
        supplierRnc: '101099161',
        buyerRnc: '132943058',
        ncf: 'E310000726627',
        invoiceDate: '2026-10-05',
        total: 1500,
        securityCode: 'K9m2Xq',
        itbis: null,
      });
    });

    it('acepta las facturas de consumo (fc.dgii.gov.do) con solo lo que traen', () => {
      const r = parseDgiiQr('https://fc.dgii.gov.do/ecf/ConsultaTimbreFC?RncEmisor=101019921&ENCF=E320050542332&MontoTotal=1,174.50');
      expect(r.ncf).toBe('E320050542332');
      expect(r.total).toBe(1174.5);
      expect(r.buyerRnc).toBeNull();
      expect(r.securityCode).toBeNull();
    });

    it('no distingue mayúsculas en los nombres de los parámetros', () => {
      const r = parseDgiiQr('https://ecf.dgii.gov.do/x?rncemisor=130991873&encf=e310000000001&montototal=10');
      expect(r.supplierRnc).toBe('130991873');
      expect(r.ncf).toBe('E310000000001');
    });

    it('si el QR trae el ITBIS, lo toma', () => {
      expect(parseDgiiQr(`${QR}&TotalITBIS=228.81`).itbis).toBe(228.81);
    });

    it('un código de seguridad con + o / (Base64) se conserva, venga crudo o codificado', () => {
      expect(parseDgiiQr(QR.replace('K9m2Xq', 'a+b/Cd')).securityCode).toBe('a+b/Cd');
      expect(parseDgiiQr(QR.replace('K9m2Xq', 'a%2Bb%2FCd')).securityCode).toBe('a+b/Cd');
    });

    it('un código de seguridad con forma rara se descarta en vez de usarse', () => {
      expect(parseDgiiQr(QR.replace('K9m2Xq', 'a b!')).securityCode).toBeNull();
    });
  });

  describe('parseDgiiQr — rechaza lo que no sirve', () => {
    it('un texto que no es una dirección', () => {
      expect(() => parseDgiiQr('hola')).toThrow(QrParseError);
      expect(() => parseDgiiQr('')).toThrow('no es de un comprobante');
    });

    it('SEGURIDAD: una dirección de otro sitio no se acepta (el servidor la consultaría)', () => {
      expect(() => parseDgiiQr('https://evil.example.com/dgii.gov.do?RncEmisor=101099161&ENCF=E310000726627')).toThrow('no es de la DGII');
      expect(() => parseDgiiQr('https://dgii.gov.do.evil.com/x?RncEmisor=101099161&ENCF=E310000726627')).toThrow('no es de la DGII');
      expect(() => parseDgiiQr('http://169.254.169.254/latest/meta-data?RncEmisor=101099161&ENCF=E310000726627')).toThrow('no es de la DGII');
    });

    it('sin RNC o sin e-NCF válidos', () => {
      expect(() => parseDgiiQr('https://ecf.dgii.gov.do/ecf/ConsultaTimbre?ENCF=E310000726627')).toThrow('RNC y un e-NCF');
      expect(() => parseDgiiQr('https://ecf.dgii.gov.do/ecf/ConsultaTimbre?RncEmisor=101099161&ENCF=X1')).toThrow('RNC y un e-NCF');
    });
  });

  describe('isDgiiUrl', () => {
    it('solo dgii.gov.do y sus subdominios', () => {
      expect(isDgiiUrl('https://ecf.dgii.gov.do/a')).toBe(true);
      expect(isDgiiUrl('https://dgii.gov.do/a')).toBe(true);
      expect(isDgiiUrl('https://notdgii.gov.do/a')).toBe(false);
      expect(isDgiiUrl('ftp://ecf.dgii.gov.do/a')).toBe(false);
      expect(isDgiiUrl('javascript:alert(1)')).toBe(false);
    });
  });

  describe('dgiiDateToIso', () => {
    it('convierte dd-MM-yyyy y dd/MM/yyyy', () => {
      expect(dgiiDateToIso('05-10-2026')).toBe('2026-10-05');
      expect(dgiiDateToIso('5/10/2026')).toBe('2026-10-05');
      expect(dgiiDateToIso('2026-10-05')).toBe('2026-10-05');
    });
    it('rechaza lo imposible', () => {
      expect(dgiiDateToIso('31-02-2026')).toBeNull();
      expect(dgiiDateToIso('ayer')).toBeNull();
      expect(dgiiDateToIso(null)).toBeNull();
    });
  });
});
