import { BadRequestException } from '@nestjs/common';
import { calcDoc, consolidar, parseResultado, valorar } from './material-calc-doc';

const base = {
  resumen: [{ label: 'Área neta', valor: '13 m²' }],
  manoObra: [{ actividad: 'Levantar block', cuadrilla: '1 albañil + 1 ayudante', rendimiento: '10 m²/día', dias: 1.3 }],
  notas: [],
};

const cemento = (cantidad: number, exacto: number) => ({
  clave: 'cemento_gris', descripcion: 'Cemento (funda 42.5 kg)', cantidad, exacto, unidad: 'fundas',
});

describe('material-calc-doc', () => {
  it('consolida sumando exactos: 1.6 + 3.7 + 3.7 fundas son 9, no 10', () => {
    const r = parseResultado({
      ...base,
      grupos: [
        { titulo: 'Pega', lineas: [cemento(2, 1.6), { clave: 'arena', descripcion: 'Arena', cantidad: 0.22, unidad: 'm³' }] },
        { titulo: 'Relleno', lineas: [cemento(4, 3.7), { clave: 'arena', descripcion: 'Arena', cantidad: 0.23, unidad: 'm³' }] },
        { titulo: 'Pañete', lineas: [cemento(4, 3.7)] },
      ],
    });
    const l = consolidar(r);
    expect(l.find((x) => x.clave === 'cemento_gris')?.cantidad).toBe(9);
    expect(l.find((x) => x.clave === 'arena')?.cantidad).toBe(0.45);
  });

  it('valora solo lo enlazado y el total ignora lo que no tiene precio', () => {
    const lineas = [
      { clave: 'cemento_gris', descripcion: 'Cemento', cantidad: 9, unidad: 'fundas' },
      { clave: 'arena', descripcion: 'Arena', cantidad: 0.45, unidad: 'm³' },
      { clave: 'agua', descripcion: 'Agua', cantidad: 229, unidad: 'L' },
    ];
    const enlaces = new Map([
      ['cemento_gris', { id: 'm1', name: 'Cemento gris 42.5 kg', unit: 'funda', precio: 580 }],
      ['arena', { id: 'm2', name: 'Arena lavada', unit: 'm³', precio: null }],
    ]);
    const { lineas: v, total } = valorar(lineas, enlaces);
    expect(v[0].subtotal).toBe(5220);
    expect(v[1].precioUnitario).toBeNull();
    expect(v[2].materialId).toBeNull();
    expect(total).toBe(5220);
  });

  it('sin ningún precio el total es null (no 0)', () => {
    const { total } = valorar([{ clave: 'agua', descripcion: 'Agua', cantidad: 10, unidad: 'L' }], new Map());
    expect(total).toBeNull();
  });

  it('rechaza cantidades inválidas y claves raras', () => {
    const malo = (linea: Record<string, unknown>) => () =>
      parseResultado({ ...base, grupos: [{ titulo: 'x', lineas: [linea] }] });
    expect(malo({ clave: 'arena', descripcion: 'A', cantidad: -1, unidad: 'm³' })).toThrow(BadRequestException);
    expect(malo({ clave: 'arena', descripcion: 'A', cantidad: Number.NaN, unidad: 'm³' })).toThrow(BadRequestException);
    expect(malo({ clave: '../x', descripcion: 'A', cantidad: 1, unidad: 'm³' })).toThrow(BadRequestException);
    expect(() => parseResultado({ ...base, grupos: 'no' })).toThrow(BadRequestException);
  });

  it('el documento lleva la lista con precios y el aviso de lo que falta', () => {
    const r = parseResultado({ ...base, grupos: [{ titulo: 'Block', lineas: [cemento(2, 1.6)] }] });
    const { lineas, total } = valorar(consolidar(r), new Map([['cemento_gris', { id: 'm1', name: 'C', unit: 'funda', precio: 500 }]]));
    const doc = calcDoc({
      title: 'Muro de block', projectLabel: 'PRJ-1 — Obra', fecha: '2026-09-25 10:00', autor: 'Pedro',
      resultado: r, lista: lineas, total, filename: 'x',
    });
    const lista = doc.tables.find((t) => t.name === 'Lista de materiales');
    expect(lista?.rows[0]).toEqual(['Cemento (funda 42.5 kg)', '2', 'fundas', 500, 1000]);
    expect(lista?.totals).toBe(true);
    expect(doc.tables.every((t) => t.name.length <= 31)).toBe(true);
  });
});
