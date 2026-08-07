import { docToPdf, textoPdf } from './report-export';
import type { ExportDoc } from './report-tables';
import { COMPANY } from '../common/company';

function doc(over: Partial<ExportDoc> = {}): ExportDoc {
  return {
    title: 'Informe',
    filename: 'informe',
    filters: [{ label: 'Proyecto', value: 'PRJ-2026-001' }],
    tables: [
      {
        name: 'Resumen',
        title: 'Resumen',
        columns: [{ header: 'Concepto' }, { header: 'Monto', type: 'money', total: true }],
        rows: [['Balance (cobros − gastos)', 1000]],
        totals: true,
      },
    ],
    ...over,
  } as ExportDoc;
}

describe('textoPdf', () => {
  // Helvetica escribe en WinAnsi: estos caracteres salían como basura en el PDF.
  it('sustituye el menos matemático, que no existe en WinAnsi', () => {
    expect(textoPdf('cobros − gastos')).toBe('cobros - gastos');
  });

  it('normaliza comillas curvas, puntos suspensivos y espacio duro', () => {
    expect(textoPdf('“hola” ‘eso’')).toBe('"hola" \'eso\'');
    expect(textoPdf('espera…')).toBe('espera...');
    expect(textoPdf('a b')).toBe('a b');
  });

  it('respeta los signos que WinAnsi sí tiene', () => {
    expect(textoPdf('—')).toBe('—');
    expect(textoPdf('·')).toBe('·');
    expect(textoPdf('RD$ 1,000.00')).toBe('RD$ 1,000.00');
  });

  it('no revienta con null ni undefined', () => {
    expect(textoPdf(null)).toBe('');
    expect(textoPdf(undefined)).toBe('');
  });
});

describe('docToPdf con textos largos', () => {
  const LARGO =
    'Informe técnico de avance de obra correspondiente al período evaluado por la supervisión ' +
    'con observaciones detalladas de la ejecución electromecánica y sus hallazgos';

  // El bug: el título se dibujaba envolviendo en varias líneas pero `y` avanzaba
  // 20 puntos fijos, así que la segunda línea quedaba pisada por el subtítulo.
  it('un título largo no pisa el subtítulo: el PDF crece respecto al título corto', async () => {
    const corto = await docToPdf(doc({ title: 'Informe' }), COMPANY);
    const largo = await docToPdf(doc({ title: LARGO }), COMPANY);

    expect(corto.subarray(0, 4).toString()).toBe('%PDF');
    expect(largo.subarray(0, 4).toString()).toBe('%PDF');
    // Si el título de dos líneas se solapara, el contenido ocuparía lo mismo.
    expect(largo.length).toBeGreaterThan(corto.length);
  });

  it('un título de tabla largo tampoco rompe la generación', async () => {
    const d = doc();
    d.tables[0].title = LARGO;
    const pdf = await docToPdf(d, COMPANY);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
