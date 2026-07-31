import {
  normalizeTree,
  directSubtotal,
  lineTotal,
  rowsToTree,
  flattenTree,
  ancestorPath,
  treeDepth,
  countNodes,
  QuoteRowLike,
} from './quote-tree';

// El ejemplo real de Pedro: remodelación de un baño dividida por áreas.
const bano = [
  {
    description: 'Baño',
    children: [
      {
        description: 'Piso',
        children: [
          { description: 'Cerámica 60x60', quantity: 25, unit: 'm²', unitPrice: 1200 },
          { description: 'Mortero', quantity: 8, unit: 'fdo', unitPrice: 450 },
          { description: 'Mano de obra', quantity: 25, unit: 'm²', unitPrice: 400 },
        ],
      },
      {
        description: 'Plomería',
        children: [
          { description: 'Tubería PVC 1/2"', quantity: 30, unit: 'ml', unitPrice: 120 },
          { description: 'Mano de obra', quantity: 1, unit: 'ud', unitPrice: 8500 },
        ],
      },
    ],
  },
];

describe('lineTotal', () => {
  it('aplica el descuento porcentual', () => {
    expect(lineTotal({ quantity: 10, unitPrice: 100, discountPct: 10 })).toBe(900);
  });

  it('acota el descuento a 0-100 y trata los vacíos como cero', () => {
    expect(lineTotal({ quantity: 2, unitPrice: 50, discountPct: 150 })).toBe(0);
    expect(lineTotal({ quantity: 2, unitPrice: 50, discountPct: -20 })).toBe(100);
    expect(lineTotal({})).toBe(0);
  });

  it('redondea a 2 decimales sin arrastrar error binario', () => {
    expect(lineTotal({ quantity: 5.5, unitPrice: 1234.57 })).toBe(6790.14);
  });
});

describe('normalizeTree', () => {
  const tree = normalizeTree(bano);

  it('suma cada grupo de abajo arriba', () => {
    const piso = tree[0].children[0];
    const plomeria = tree[0].children[1];
    expect(piso.total).toBe(43600); // 30.000 + 3.600 + 10.000
    expect(plomeria.total).toBe(12100); // 3.600 + 8.500
    expect(tree[0].total).toBe(55700);
  });

  it('numera jerárquicamente en orden de lectura', () => {
    expect(tree[0].label).toBe('1');
    expect(tree[0].children[0].label).toBe('1.1');
    expect(tree[0].children[0].children[1].label).toBe('1.1.2');
    expect(tree[0].children[1].label).toBe('1.2');
  });

  it('un nodo con hijos es grupo aunque el cliente lo mande como línea', () => {
    const forzado = normalizeTree([
      {
        kind: 'item',
        description: 'Baño',
        quantity: 99,
        unitPrice: 99999,
        children: [{ description: 'Piso', quantity: 1, unitPrice: 1000 }],
      },
    ]);
    expect(forzado[0].kind).toBe('group');
    // La cantidad y el precio del padre se descartan: el total sale de los hijos.
    expect(forzado[0].total).toBe(1000);
    expect(forzado[0].quantity).toBe(0);
  });

  it('un grupo declarado sin hijos vale cero, no NaN', () => {
    const vacio = normalizeTree([{ kind: 'group', description: 'Baño' }]);
    expect(vacio[0].kind).toBe('group');
    expect(vacio[0].total).toBe(0);
  });

  it('acepta líneas sueltas en la raíz, sin partida', () => {
    const suelto = normalizeTree([
      { description: 'Visita técnica', quantity: 1, unitPrice: 3500 },
    ]);
    expect(suelto[0].kind).toBe('item');
    expect(suelto[0].total).toBe(3500);
  });
});

describe('directSubtotal', () => {
  it('suma solo las hojas: los grupos no se cuentan dos veces', () => {
    expect(directSubtotal(normalizeTree(bano))).toBe(55700);
  });

  it('mezcla líneas sueltas y partidas sin duplicar nada', () => {
    const mixto = normalizeTree([
      ...bano,
      { description: 'Visita técnica', quantity: 1, unitPrice: 3500 },
    ]);
    expect(directSubtotal(mixto)).toBe(59200);
  });
});

describe('treeDepth / countNodes', () => {
  it('mide la profundidad y el número de nodos del árbol', () => {
    const tree = normalizeTree(bano);
    expect(treeDepth(tree)).toBe(3); // Baño > Piso > línea
    expect(countNodes(tree)).toBe(8); // 1 + 2 grupos + 5 líneas
  });
});

describe('rowsToTree', () => {
  const rows: QuoteRowLike[] = [
    { id: 'g1', parentId: null, kind: 'group', description: 'Baño', quantity: 0, unitPrice: 0, total: 43600, sortOrder: 0 },
    { id: 'g2', parentId: 'g1', kind: 'group', description: 'Piso', quantity: 0, unitPrice: 0, total: 43600, sortOrder: 0 },
    { id: 'i2', parentId: 'g2', kind: 'item', description: 'Mortero', quantity: 8, unitPrice: 450, total: 3600, sortOrder: 1 },
    { id: 'i1', parentId: 'g2', kind: 'item', description: 'Cerámica', quantity: 25, unitPrice: 1200, total: 30000, sortOrder: 0 },
  ];

  it('reconstruye la jerarquía y respeta sortOrder entre hermanos', () => {
    const tree = rowsToTree(rows);
    expect(tree).toHaveLength(1);
    expect(tree[0].row.id).toBe('g1');
    const piso = tree[0].children[0];
    expect(piso.children.map((c) => c.row.id)).toEqual(['i1', 'i2']);
    expect(piso.children[1].label).toBe('1.1.2');
  });

  it('cuelga de la raíz las filas huérfanas en vez de perderlas', () => {
    const huerfana: QuoteRowLike = {
      id: 'x1', parentId: 'no-existe', kind: 'item', description: 'Suelta',
      quantity: 1, unitPrice: 100, total: 100, sortOrder: 9,
    };
    const tree = rowsToTree([...rows, huerfana]);
    expect(tree.map((n) => n.row.id)).toContain('x1');
    expect(flattenTree(tree)).toHaveLength(5);
  });

  it('tolera una lista vacía', () => {
    expect(rowsToTree([])).toEqual([]);
  });
});

describe('ancestorPath', () => {
  it('devuelve la ruta de ancestros para el Excel', () => {
    const rows: QuoteRowLike[] = [
      { id: 'g1', parentId: null, kind: 'group', description: 'Baño', quantity: 0, unitPrice: 0, total: 0, sortOrder: 0 },
      { id: 'g2', parentId: 'g1', kind: 'group', description: 'Piso', quantity: 0, unitPrice: 0, total: 0, sortOrder: 0 },
      { id: 'i1', parentId: 'g2', kind: 'item', description: 'Cerámica', quantity: 1, unitPrice: 1, total: 1, sortOrder: 0 },
    ];
    const tree = rowsToTree(rows);
    expect(ancestorPath(tree, 'i1')).toBe('Baño > Piso');
    expect(ancestorPath(tree, 'g1')).toBe('');
  });
});
