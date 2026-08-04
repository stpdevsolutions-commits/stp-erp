import {
  computeAcuCost,
  convertQuantity,
  AcuItemInput,
  CurrentPriceMap,
} from './acu-cost';

const CABLE = 'mat-cable';
const TUBO = 'mat-tubo';

const precios: CurrentPriceMap = new Map([
  [CABLE, 17.12],
  [TUBO, 20.267],
]);

function material(over: Partial<AcuItemInput> = {}): AcuItemInput {
  return { id: 'i1', kind: 'material', materialId: CABLE, quantity: 1, ...over };
}

describe('computeAcuCost — materiales', () => {
  it('valora con el precio vigente del catálogo', () => {
    const r = computeAcuCost([material({ quantity: 3 })], precios);
    expect(r.materialCost).toBe(51.36);
    expect(r.directCost).toBe(51.36);
    expect(r.lines[0].costSource).toBe('catalog');
    expect(r.incomplete).toBe(false);
  });

  it('el desperdicio sube la cantidad, no el precio', () => {
    const r = computeAcuCost([material({ quantity: 10, wastePct: 5 })], precios);
    expect(r.lines[0].effectiveQuantity).toBe(10.5);
    expect(r.lines[0].unitCost).toBe(17.12);
    expect(r.materialCost).toBe(179.76);
  });

  it('un unitCost explícito en la receta gana sobre el catálogo', () => {
    const r = computeAcuCost([material({ quantity: 2, unitCost: 10 })], precios);
    expect(r.materialCost).toBe(20);
    expect(r.lines[0].costSource).toBe('manual');
  });

  it('material sin precio: la línea vale 0 y el ACU queda INCOMPLETO', () => {
    const r = computeAcuCost([material({ materialId: 'mat-sin-precio', quantity: 5 })], precios);
    expect(r.materialCost).toBe(0);
    expect(r.incomplete).toBe(true);
    expect(r.missingMaterialIds).toEqual(['mat-sin-precio']);
    expect(r.lines[0].missingPrice).toBe(true);
  });

  it('no inventa precio ni descarta la línea en silencio', () => {
    const r = computeAcuCost(
      [material({ id: 'a', quantity: 1 }), material({ id: 'b', materialId: 'x', quantity: 1 })],
      precios,
    );
    // La línea sin precio sigue visible en el desglose: se ve QUÉ falta.
    expect(r.lines).toHaveLength(2);
    expect(r.incomplete).toBe(true);
  });

  it('suma varios materiales distintos', () => {
    const r = computeAcuCost(
      [
        material({ id: 'a', materialId: CABLE, quantity: 3.2 }),
        material({ id: 'b', materialId: TUBO, quantity: 1 }),
      ],
      precios,
    );
    expect(r.materialCost).toBe(75.051); // 54.784 + 20.267, sin redondear a 2 por línea
  });
});

describe('computeAcuCost — mano de obra y equipo', () => {
  it('rendimiento: cantidad de recurso × tarifa', () => {
    // 0.125 días de electricista (1 día alcanza para 8 salidas) a RD$2.400/día.
    const r = computeAcuCost(
      [{ id: 'l1', kind: 'labor', quantity: 0.125, unitCost: 2400, basis: 'yield' }],
      precios,
    );
    expect(r.laborCost).toBe(300);
    expect(r.directCost).toBe(300);
  });

  it('porcentaje sobre materiales: es el modelo que trae el Excel de STP (20 %)', () => {
    const r = computeAcuCost(
      [
        material({ id: 'm', quantity: 10 }), // 171.20
        { id: 'l', kind: 'labor', basis: 'pct_materials', pct: 20 },
      ],
      precios,
    );
    expect(r.materialCost).toBe(171.2);
    expect(r.laborCost).toBe(34.24);
    expect(r.directCost).toBe(205.44);
  });

  it('el porcentaje se calcula DESPUÉS de los materiales, no importa el orden', () => {
    const items: AcuItemInput[] = [
      { id: 'l', kind: 'labor', basis: 'pct_materials', pct: 20 },
      material({ id: 'm', quantity: 10 }),
    ];
    expect(computeAcuCost(items, precios).laborCost).toBe(34.24);
  });

  it('un porcentaje sin materiales da 0, no NaN', () => {
    const r = computeAcuCost([{ id: 'l', kind: 'labor', basis: 'pct_materials', pct: 20 }], precios);
    expect(r.laborCost).toBe(0);
    expect(r.directCost).toBe(0);
  });

  it('separa mano de obra de equipo en el desglose', () => {
    const r = computeAcuCost(
      [
        material({ id: 'm', quantity: 1 }),
        { id: 'l', kind: 'labor', quantity: 1, unitCost: 100 },
        { id: 'e', kind: 'equipment', quantity: 0.5, unitCost: 800 },
      ],
      precios,
    );
    expect(r.materialCost).toBe(17.12);
    expect(r.laborCost).toBe(100);
    expect(r.equipmentCost).toBe(400);
    expect(r.directCost).toBe(517.12);
  });

  it('el % sobre materiales ignora un material sin precio en su base (no lo adivina)', () => {
    const r = computeAcuCost(
      [
        material({ id: 'm', materialId: 'x', quantity: 10 }),
        { id: 'l', kind: 'labor', basis: 'pct_materials', pct: 20 },
      ],
      precios,
    );
    expect(r.laborCost).toBe(0);
    expect(r.incomplete).toBe(true); // el aviso viaja con el resultado
  });
});

describe('computeAcuCost — bordes', () => {
  it('receta vacía da ceros, no NaN', () => {
    const r = computeAcuCost([], precios);
    expect(r.directCost).toBe(0);
    expect(r.incomplete).toBe(false);
  });

  it('cantidades nulas o negativas se tratan como 0', () => {
    const r = computeAcuCost(
      [material({ id: 'a', quantity: null }), material({ id: 'b', quantity: -5 })],
      precios,
    );
    expect(r.materialCost).toBe(0);
  });

  it('no arrastra error de coma flotante al total', () => {
    const r = computeAcuCost([material({ quantity: 0.1 }), material({ id: 'b', quantity: 0.2 })], precios);
    expect(r.materialCost).toBe(5.136); // 1.712 + 3.424, exacto: el sesgo de redondear por línea no existe
  });
});

describe('convertQuantity', () => {
  const pie = { id: 'u-pie', factor: 0.3048, baseUnitId: 'u-m' };
  const metro = { id: 'u-m', factor: null, baseUnitId: null };
  const kg = { id: 'u-kg', factor: null, baseUnitId: null };

  it('misma unidad: devuelve la cantidad tal cual', () => {
    expect(convertQuantity(5, pie, pie)).toBe(5);
  });

  it('pie a metro usa el factor', () => {
    expect(convertQuantity(10, pie, metro)).toBe(3.048);
  });

  it('metro a pie invierte el factor', () => {
    expect(convertQuantity(3.048, metro, pie)).toBe(10);
  });

  it('magnitudes distintas NO se convierten: devuelve null', () => {
    expect(convertQuantity(1, pie, kg)).toBeNull();
  });

  it('sin factor declarado devuelve null en vez de asumir 1', () => {
    const roto = { id: 'u-x', factor: null, baseUnitId: 'u-m' };
    expect(convertQuantity(1, roto, metro)).toBeNull();
  });
});
