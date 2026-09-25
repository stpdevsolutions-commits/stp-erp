import { CATEGORIAS_CONSTRUCCION, categoriaPorReglas } from './category-rules';

const cats = [
  ...['CAB', 'CJA', 'DIS', 'ILU', 'PRO', 'RED', 'TIE', 'TUB'].map((code) => ({ id: code, code })),
  ...CATEGORIAS_CONSTRUCCION.map((c) => ({ id: c.code, code: c.code })),
];
const cat = (d: string) => categoriaPorReglas(d, cats)?.code ?? null;

describe('category-rules', () => {
  it('cotización de Procontratista (drywall)', () => {
    expect(cat('PLANCHA DENS-GLASS GOLD 4X8X1/2')).toBe('DRY');
    expect(cat('TRAVESAL MEGAMASTER 2 1/2 X10 G60 33Ksi')).toBe('DRY');
    expect(cat('PERFIL MEGAMASTER 3 5/8 X10 #22 G60 33Ksi')).toBe('DRY');
    expect(cat('ESQUINERO PLASTICO MEGAMASTER 1 1/4x10')).toBe('DRY');
    expect(cat('TAPE FIBRA VIDRIO 2x 300 PIES')).toBe('DRY');
    expect(cat('CEMENTIN 50 LBS MAPEI')).toBe('DRY');
    expect(cat('PIN 1 CON ARANDELA')).toBe('FIJ');
    expect(cat('FULMINANTE VERDE CAL.22 AMERICANO')).toBe('FIJ');
    expect(cat('TORNILLO P/PLANCHA #6x1-1/4 AUTO (LB)')).toBe('FIJ');
    expect(cat('PINO AMERIC. BRUTO TRATADO 1X2X7')).toBe('MAD');
  });

  it('cotización eléctrica (SUPLYMATEC)', () => {
    expect(cat('ALAMBRE ST THHN #12 NEGRO')).toBe('CAB');
    expect(cat('ALAMBRE DE GOMA 6.0/4 MM (8/4)')).toBe('CAB');
    expect(cat('TUBO EMT DE 1-1/2 X 10')).toBe('TUB');
    expect(cat('BREAKER 2X30A GE')).toBe('PRO');
    expect(cat('CAJA OCTAGONAL 4" GALV')).toBe('CJA');
    expect(cat('TOMACORRIENTE DOBLE 15A')).toBe('DIS');
  });

  it('casos que las reglas genéricas confundirían', () => {
    expect(cat('PANEL LED 2X2 40W')).toBe('ILU');
    expect(cat('VARILLA DE TIERRA 5/8 X 8')).toBe('TIE');
    expect(cat('ALAMBRE DE AMARRE #18')).toBe('ACE');
    expect(cat('VARILLA 3/8 GRADO 40')).toBe('ACE');
    expect(cat('PLAFON 2X4 FISURADO')).toBe('PLA');
    expect(cat('CERAMICA 60X60 GRIS')).toBe('PIS');
    expect(cat('CEMENTO GRIS 42.5 KG')).toBe('CEM');
  });

  it('materiales reales del catálogo que las reglas confundían (2026-09-25)', () => {
    expect(cat('Patch panel 24 puntos Cat 6A')).toBe('RED');
    expect(cat('Organizador de cables de 1U')).toBe('RED');
    expect(cat('Cable u/utp 4 pares Cat 6A, Panduit, Nexxt, LanPRO o similar')).toBe('RED');
    expect(cat('Tomacorriente monofásico con polo a tierra aislado tipo levitón color naranja')).toBe('DIS');
    expect(cat('Luminaria plafón 2x2 40W led 6500k Silvania o similar')).toBe('ILU');
    expect(cat('Conector Varilla de tierra 5/8')).toBe('TIE');
    expect(cat('Letra LB 1/2"')).toBe('CJA');
  });

  it('sin regla o sin la categoría en el catálogo: null', () => {
    expect(cat('SERVICIO DE TRANSPORTE')).toBeNull();
    expect(categoriaPorReglas('PLANCHA DENS-GLASS', [{ id: '1', code: 'CAB' }])).toBeNull();
  });
});
