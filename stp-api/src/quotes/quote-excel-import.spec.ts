import * as ExcelJS from 'exceljs';
import { parseQuoteExcel, toNumber } from './quote-excel-import';

async function book(rows: (string | number | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Presupuesto');
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('toNumber', () => {
  it('lee formatos con coma y punto', () => {
    expect(toNumber('1,250.50')).toBe(1250.5);
    expect(toNumber('RD$ 1.250,50')).toBe(1250.5);
    expect(toNumber('12,5')).toBe(12.5);
    expect(toNumber('1,250')).toBe(1250);
    expect(toNumber('abc')).toBeNull();
    expect(toNumber(null)).toBeNull();
  });
});

describe('parseQuoteExcel', () => {
  it('lee cabecera, secciones, líneas y salta los resúmenes', async () => {
    const buf = await book([
      ['COTIZACIÓN PROVEEDOR XYZ'],
      [],
      ['Ítem', 'Descripción', 'Cantidad', 'Und.', 'Precio unitario', 'Total'],
      [null, 'PRELIMINARES', null, null, null, null],
      [1, 'Limpieza de terreno', 10, 'm2', 150, 1500],
      [2, 'Replanteo', 1, 'P.A.', null, 3000],
      [null, 'ELÉCTRICO', null, null, null, null],
      [3, 'Cable #12', 100, 'ml', '35.50', null],
      [null, 'Subtotal', null, null, null, 8050],
      [null, 'ITBIS 18%', null, null, null, 1449],
      [null, 'TOTAL', null, null, null, 9499],
    ]);
    const r = await parseQuoteExcel(buf);
    expect(r.itemCount).toBe(3);
    expect(r.groupCount).toBe(2);
    expect(r.nodes[0].children).toHaveLength(2);
    expect(r.nodes[0].children![1]).toMatchObject({ description: 'Replanteo', quantity: 1, unitPrice: 3000 });
    expect(r.nodes[1].children![0]).toMatchObject({ unit: 'ml', unitPrice: 35.5, quantity: 100 });
    expect(r.skipped.map((s) => s.text)).toEqual(expect.arrayContaining(['Subtotal', 'ITBIS 18%', 'TOTAL']));
  });

  it('rechaza archivos sin cabecera reconocible', async () => {
    const buf = await book([['hola', 'mundo'], [1, 2]]);
    await expect(parseQuoteExcel(buf)).rejects.toThrow(/fila de títulos/);
  });
});
