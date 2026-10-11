import {
  CATALOGOS_606,
  esBienes,
  fechaParts,
  tipo606,
  tipoId,
  toRow606,
  type Invoice606Source,
} from './form-606';

const factura = (over: Partial<Invoice606Source> = {}): Invoice606Source => ({
  ncf: 'B0100000012',
  ncfType: 'B01',
  supplierRnc: '130991873',
  supplierName: 'FERRETERIA UNO SRL',
  baseAmount: 1000,
  itbis: 180,
  isc: 0,
  tip: 0,
  otherTax: 0,
  totalAmount: 1180,
  paymentMethod: '02',
  expenseType: '02',
  invoiceDate: '2026-10-05',
  ...over,
});

describe('form-606', () => {
  describe('tipoId (igual que FiscoRD)', () => {
    it('9 dígitos = RNC, 11 = cédula, con o sin guiones', () => {
      expect(tipoId('130991873')).toBe('1');
      expect(tipoId('00112345678')).toBe('2');
      expect(tipoId('001-1234567-8')).toBe('2');
      expect(tipoId('')).toBe('1');
    });
  });

  describe('bienes vs servicios', () => {
    it('09 y 10 son bienes; el resto, servicios', () => {
      expect(esBienes('09')).toBe(true);
      expect(esBienes('10')).toBe(true);
      expect(esBienes('02')).toBe(false);
      expect(esBienes('11')).toBe(false);
      expect(esBienes('')).toBe(false);
    });
  });

  describe('tipo606', () => {
    it('conserva los códigos del catálogo', () => {
      expect(tipo606('09')).toBe('09');
      expect(tipo606('11')).toBe('11');
    });
    it("manda a '02' los códigos fuera de catálogo de las facturas migradas", () => {
      expect(tipo606('12')).toBe('02');
      expect(tipo606('99')).toBe('02');
      expect(tipo606('')).toBe('02');
    });
  });

  describe('fechaParts', () => {
    it('separa año-mes y día', () => {
      expect(fechaParts('2026-10-05')).toEqual({ anomes: '202610', dia: '05' });
      expect(fechaParts('2026-12-31')).toEqual({ anomes: '202612', dia: '31' });
    });
    it('acepta una fecha con hora y devuelve vacío si no hay', () => {
      expect(fechaParts('2026-10-05T00:00:00.000Z')).toEqual({ anomes: '202610', dia: '05' });
      expect(fechaParts(null)).toEqual({ anomes: '', dia: '' });
      expect(fechaParts('')).toEqual({ anomes: '', dia: '' });
    });
  });

  describe('toRow606', () => {
    it('un servicio con ITBIS: el base va a servicios', () => {
      const r = toRow606(factura());
      expect(r).toMatchObject({
        rnc: '130991873',
        tipoId: '1',
        tipoGasto: '02',
        descripcionGasto: 'Gastos por trabajos, suministros y servicios',
        ncf: 'B0100000012',
        anomes: '202610',
        dia: '05',
        servicios: 1000,
        bienes: 0,
        itbis: 180,
        formaPago: '02',
        totalFacturado: 1000,
        totalGeneral: 1180,
        proyecto: 'General',
      });
    });

    it('una compra de costo de venta (09): el base va a bienes', () => {
      const r = toRow606(factura({ expenseType: '09' }));
      expect(r.bienes).toBe(1000);
      expect(r.servicios).toBe(0);
    });

    it('lleva ISC, otros impuestos y propina a sus columnas', () => {
      const r = toRow606(factura({ isc: 5, otherTax: 2.5, tip: 100 }));
      expect(r.isc).toBe(5);
      expect(r.otrosImpuestos).toBe(2.5);
      expect(r.propina).toBe(100);
    });

    it('un código de gasto viejo (99) se reporta como 02', () => {
      const r = toRow606(factura({ expenseType: '99' }));
      expect(r.tipoGasto).toBe('02');
      expect(r.descripcionGasto).toBe('Gastos por trabajos, suministros y servicios');
    });

    it('redondea a 2 decimales (el 316059.22000000003 de FiscoRD)', () => {
      const r = toRow606(factura({ baseAmount: 316059.22000000003, totalAmount: 316059.22000000003 }));
      expect(r.servicios).toBe(316059.22);
      expect(r.totalGeneral).toBe(316059.22);
    });

    it('muestra el código del proyecto cuando el gasto enlazado lo tiene', () => {
      const r = toRow606(factura({ expense: { project: { code: 'PRJ-2026-003' } } }));
      expect(r.proyecto).toBe('PRJ-2026-003');
      expect(toRow606(factura({ expense: { project: null } })).proyecto).toBe('General');
    });

    it('trae el estado de la DGII si lo hay', () => {
      expect(toRow606(factura({ dgiiEstado: 'Vigente' })).estadoDgii).toBe('Vigente');
      expect(toRow606(factura({ dgiiEstado: null })).estadoDgii).toBe('');
    });
  });

  it('los catálogos salen ordenados por código (01…11, no 10 y 11 primero)', () => {
    const tipos = CATALOGOS_606.filter((c) => c.catalogo.startsWith('Col 3')).map((c) => c.codigo);
    expect(tipos).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11']);
    const pagos = CATALOGOS_606.filter((c) => c.catalogo.startsWith('Col 23')).map((c) => c.codigo);
    expect(pagos).toEqual(['01', '02', '03', '04', '05', '06', '07']);
  });

  it('los catálogos traen los 11 tipos de gasto, las 7 formas de pago y los 2 tipos de ID', () => {
    const count = (name: string) => CATALOGOS_606.filter((c) => c.catalogo.startsWith(name)).length;
    expect(count('Col 3')).toBe(11);
    expect(count('Col 23')).toBe(7);
    expect(count('Col 2 ')).toBe(2);
  });
});
