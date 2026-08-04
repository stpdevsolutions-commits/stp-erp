import {
  applyMarkup,
  compareAcuLine,
  summarizeAcuDrift,
  buildAcuDriftReport,
  ACU_FREEZE_AGE_DAYS,
  type FrozenAcuLine,
  type CurrentAcuCost,
} from './acu-pricing';

const HOY = new Date('2026-08-04T12:00:00Z');
const AYER = new Date('2026-08-03T12:00:00Z');

function linea(over: Partial<FrozenAcuLine> = {}): FrozenAcuLine {
  return {
    id: 'item-1',
    description: 'Salida eléctrica de tomacorriente',
    quantity: 10,
    unitPrice: 135,
    discountPct: 0,
    acuId: 'acu-1',
    acuUnitCost: 100,
    acuMarkupPct: 35,
    acuPricedAt: AYER,
    acuIncomplete: false,
    ...over,
  };
}

function costo(over: Partial<CurrentAcuCost> = {}): CurrentAcuCost {
  return { directCost: 100, incomplete: false, ...over };
}

describe('applyMarkup', () => {
  it('aplica el margen sobre el costo directo y redondea a 2', () => {
    expect(applyMarkup(100, 35)).toBe(135);
    expect(applyMarkup(17.1234, 20)).toBe(20.55);
  });

  it('sin margen el precio es el costo', () => {
    expect(applyMarkup(51.36)).toBe(51.36);
    expect(applyMarkup(51.36, null)).toBe(51.36);
  });

  it('ignora costos y márgenes negativos en vez de restar', () => {
    expect(applyMarkup(-10, 35)).toBe(0);
    expect(applyMarkup(100, -50)).toBe(100);
  });
});

describe('compareAcuLine — el precio no se mueve solo', () => {
  it('sin cambios de costo no hay aviso', () => {
    const r = compareAcuLine(linea(), costo(), HOY);
    expect(r.stale).toBe(false);
    expect(r.direction).toBe('same');
    expect(r.unitCostDelta).toBe(0);
    expect(r.suggestedUnitPrice).toBe(135);
    expect(r.lineTotalDelta).toBe(0);
  });

  it('detecta el desfase y dice en cuánto, sin tocar el precio cotizado', () => {
    const r = compareAcuLine(linea(), costo({ directCost: 112.5 }), HOY);
    expect(r.currentUnitPrice).toBe(135); // la cotización sigue igual
    expect(r.unitCostDelta).toBe(12.5);
    expect(r.unitCostDeltaPct).toBe(12.5);
    expect(r.direction).toBe('up');
    expect(r.suggestedUnitPrice).toBe(151.88); // 112.5 × 1.35
    expect(r.unitPriceDelta).toBe(16.88);
    expect(r.currentLineTotal).toBe(1350);
    expect(r.suggestedLineTotal).toBe(1518.8);
    expect(r.lineTotalDelta).toBe(168.8);
    expect(r.stale).toBe(true);
    expect(r.flags.costChanged).toBe(true);
  });

  it('una bajada de costo también se avisa', () => {
    const r = compareAcuLine(linea(), costo({ directCost: 80 }), HOY);
    expect(r.direction).toBe('down');
    expect(r.unitCostDeltaPct).toBe(-20);
    expect(r.lineTotalDelta).toBeLessThan(0);
  });

  it('una diferencia menor que un céntimo es ruido de redondeo, no noticia', () => {
    const r = compareAcuLine(linea(), costo({ directCost: 100.004 }), HOY);
    expect(r.flags.costChanged).toBe(false);
    expect(r.direction).toBe('same');
    expect(r.stale).toBe(false);
  });

  it('el margen se respeta al sugerir: compara costo contra costo', () => {
    const r = compareAcuLine(
      linea({ acuMarkupPct: 0, unitPrice: 100 }),
      costo({ directCost: 110 }),
      HOY,
    );
    expect(r.suggestedUnitPrice).toBe(110);
    expect(r.flags.manualOverride).toBe(false);
  });

  it('aplica el descuento de la línea a los dos totales', () => {
    const r = compareAcuLine(
      linea({ discountPct: 10 }),
      costo({ directCost: 200 }),
      HOY,
    );
    expect(r.currentLineTotal).toBe(1215); // 10 × 135 − 10 %
    expect(r.suggestedLineTotal).toBe(2430); // 10 × 270 − 10 %
  });
});

describe('compareAcuLine — ACU incompleto', () => {
  it('marca la línea congelada con un ACU incompleto aunque el costo no se mueva', () => {
    const r = compareAcuLine(linea({ acuIncomplete: true }), costo(), HOY);
    expect(r.flags.frozenIncomplete).toBe(true);
    expect(r.stale).toBe(true);
  });

  it('avisa si el ACU está incompleto HOY: el costo actual es un piso', () => {
    const r = compareAcuLine(linea(), costo({ incomplete: true }), HOY);
    expect(r.flags.currentIncomplete).toBe(true);
    expect(r.stale).toBe(true);
  });
});

describe('compareAcuLine — casos en los que no hay con qué comparar', () => {
  it('sin costo congelado no inventa una comparación', () => {
    const r = compareAcuLine(linea({ acuUnitCost: null }), costo(), HOY);
    expect(r.flags.noBaseline).toBe(true);
    expect(r.unitCostDelta).toBeNull();
    expect(r.unitCostDeltaPct).toBeNull();
    expect(r.direction).toBe('unknown');
    expect(r.stale).toBe(true);
    // El precio sugerido sí se puede calcular: hay costo actual y margen.
    expect(r.suggestedUnitPrice).toBe(135);
  });

  it('si el ACU ya no se puede valorar, la línea sale marcada, nunca como al día', () => {
    const r = compareAcuLine(linea(), null, HOY);
    expect(r.flags.noBaseline).toBe(true);
    expect(r.currentUnitCost).toBeNull();
    expect(r.suggestedUnitPrice).toBeNull();
    expect(r.suggestedLineTotal).toBeNull();
    expect(r.stale).toBe(true);
  });

  it('no divide entre cero cuando el costo congelado era 0', () => {
    const r = compareAcuLine(
      linea({ acuUnitCost: 0, unitPrice: 0 }),
      costo({ directCost: 50 }),
      HOY,
    );
    expect(r.unitCostDelta).toBe(50);
    expect(r.unitCostDeltaPct).toBeNull();
    expect(r.stale).toBe(true);
  });
});

describe('compareAcuLine — edad y edición a mano', () => {
  it('un congelado viejo se avisa aunque el costo no haya cambiado', () => {
    const viejo = new Date(HOY.getTime() - (ACU_FREEZE_AGE_DAYS + 1) * 86_400_000);
    const r = compareAcuLine(linea({ acuPricedAt: viejo }), costo(), HOY);
    expect(r.ageDays).toBe(ACU_FREEZE_AGE_DAYS + 1);
    expect(r.flags.aged).toBe(true);
    expect(r.flags.costChanged).toBe(false);
    expect(r.stale).toBe(true);
  });

  it('acepta la fecha como string (viene así del JSON)', () => {
    const r = compareAcuLine(linea({ acuPricedAt: '2026-08-03T12:00:00Z' }), costo(), HOY);
    expect(r.ageDays).toBe(1);
  });

  it('detecta un unitario tocado a mano después de congelar', () => {
    const r = compareAcuLine(linea({ unitPrice: 150 }), costo(), HOY);
    expect(r.flags.manualOverride).toBe(true);
    expect(r.stale).toBe(true);
    // Se avisa, no se corrige: el precio cotizado sigue siendo el que puso la persona.
    expect(r.currentUnitPrice).toBe(150);
  });
});

describe('summarizeAcuDrift', () => {
  const alDia = compareAcuLine(linea({ id: 'a' }), costo(), HOY);
  const subio = compareAcuLine(linea({ id: 'b' }), costo({ directCost: 120 }), HOY);
  const sinBase = compareAcuLine(linea({ id: 'c' }), null, HOY);

  it('suma solo las líneas enlazadas y compara los dos escenarios', () => {
    const s = summarizeAcuDrift([alDia, subio]);
    expect(s.linkedLines).toBe(2);
    expect(s.staleLines).toBe(1);
    expect(s.currentTotal).toBe(2700);
    expect(s.suggestedTotal).toBe(2970); // 1350 + 10 × 162
    expect(s.totalDelta).toBe(270);
    expect(s.totalDeltaPct).toBe(10);
    expect(s.maxDeltaPct).toBe(20);
  });

  it('una línea sin sugerencia cuenta con su importe actual, no como 0', () => {
    const s = summarizeAcuDrift([sinBase]);
    expect(s.currentTotal).toBe(1350);
    expect(s.suggestedTotal).toBe(1350);
    expect(s.totalDelta).toBe(0);
    expect(s.staleLines).toBe(1);
  });

  it('sin líneas enlazadas no hay porcentaje que dar', () => {
    const s = summarizeAcuDrift([]);
    expect(s.linkedLines).toBe(0);
    expect(s.currentTotal).toBe(0);
    expect(s.totalDeltaPct).toBeNull();
    expect(s.maxDeltaPct).toBeNull();
  });

  it('cuenta las incompletas por cualquiera de los dos motivos', () => {
    const congelada = compareAcuLine(linea({ acuIncomplete: true }), costo(), HOY);
    const hoy = compareAcuLine(linea(), costo({ incomplete: true }), HOY);
    expect(summarizeAcuDrift([congelada, hoy, alDia]).incompleteLines).toBe(2);
  });
});

describe('buildAcuDriftReport', () => {
  it('pone delante lo que más se ha movido', () => {
    const alDia = compareAcuLine(linea({ id: 'a' }), costo(), HOY);
    const poco = compareAcuLine(linea({ id: 'b' }), costo({ directCost: 101 }), HOY);
    const mucho = compareAcuLine(linea({ id: 'c' }), costo({ directCost: 180 }), HOY);

    const r = buildAcuDriftReport([alDia, poco, mucho], HOY);
    expect(r.lines.map((l) => l.itemId)).toEqual(['c', 'b', 'a']);
    expect(r.generatedAt).toBe(HOY);
    expect(r.staleLines).toBe(2);
  });
});
