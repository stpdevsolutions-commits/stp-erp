/**
 * Árbol de partidas de una cotización.
 *
 * Una cotización se organiza en partidas que pueden anidarse sin límite fijo de
 * profundidad: "Baño" → "Piso" → "Materiales" → líneas. Hay dos clases de nodo:
 *
 * - `group`: agrupa. NO tiene cantidad ni precio propios; su total es la suma de
 *   sus descendientes.
 * - `item`: la línea con cantidad × unitario − descuento.
 *
 * Todo lo de este archivo es puro (sin TypeORM ni base de datos) para poder
 * probar el cálculo y la numeración por separado; el servicio solo persiste lo
 * que estas funciones devuelven.
 */

export type QuoteItemKind = 'group' | 'item';

/** Límites duros: un árbol malicioso o accidental no debe tumbar el PDF ni la BD. */
export const MAX_TREE_DEPTH = 8;
export const MAX_TREE_NODES = 500;

export interface QuoteNodeInput {
  kind?: QuoteItemKind;
  description: string;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  discountPct?: number | null;
  children?: QuoteNodeInput[] | null;
}

export interface QuoteNode {
  kind: QuoteItemKind;
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  discountPct: number;
  /** Calculado: línea = cantidad × unitario − descuento; grupo = suma de hijos. */
  total: number;
  /** Numeración jerárquica visible: "1", "1.2", "1.2.3". */
  label: string;
  depth: number;
  children: QuoteNode[];
}

/** Fila plana tal como vive en `quote_items`. */
export interface QuoteRowLike {
  id: string;
  parentId?: string | null;
  kind?: QuoteItemKind | null;
  description: string;
  quantity: number;
  unit?: string | null;
  unitPrice: number;
  discountPct?: number | null;
  total: number;
  sortOrder: number;
}

export interface QuoteTreeRow<T extends QuoteRowLike = QuoteRowLike> {
  row: T;
  label: string;
  depth: number;
  /** Solo en grupos: suma de sus descendientes. */
  children: QuoteTreeRow<T>[];
}

const round2 = (v: number): number =>
  Math.round(Number((v || 0).toPrecision(12)) * 100) / 100;

const num = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

/** Total de una línea: cantidad × unitario, menos el descuento porcentual. */
export function lineTotal(input: {
  quantity?: number | null;
  unitPrice?: number | null;
  discountPct?: number | null;
}): number {
  const disc = Math.min(100, Math.max(0, num(input.discountPct)));
  return round2(num(input.quantity) * num(input.unitPrice) * (1 - disc / 100));
}

/**
 * Normaliza el árbol que llega del cliente: fija la clase de cada nodo, calcula
 * los totales de abajo arriba y asigna la numeración jerárquica.
 *
 * Un nodo con hijos es SIEMPRE un grupo, aunque el cliente diga otra cosa: es la
 * única forma de que el total del padre no dependa de datos contradictorios.
 */
export function normalizeTree(
  input: QuoteNodeInput[] | null | undefined,
  parentLabel = '',
  depth = 0,
): QuoteNode[] {
  if (!input?.length) return [];

  return input.map((node, index) => {
    const label = parentLabel ? `${parentLabel}.${index + 1}` : String(index + 1);
    const children = normalizeTree(node.children, label, depth + 1);
    const isGroup = children.length > 0 || node.kind === 'group';

    const base: Omit<QuoteNode, 'total'> = {
      kind: isGroup ? 'group' : 'item',
      description: node.description,
      quantity: isGroup ? 0 : num(node.quantity),
      unit: isGroup ? null : (node.unit ?? null),
      unitPrice: isGroup ? 0 : num(node.unitPrice),
      discountPct: isGroup ? 0 : num(node.discountPct),
      label,
      depth,
      children,
    };

    return {
      ...base,
      total: isGroup ? sumTotals(children) : lineTotal(node),
    };
  });
}

export function sumTotals(nodes: { total: number }[]): number {
  return round2(nodes.reduce((sum, n) => sum + num(n.total), 0));
}

/**
 * Subtotal de la cotización: suma SOLO las hojas.
 *
 * Sumar todos los nodos contaría cada línea dos veces (una en la hoja y otra en
 * el total del grupo que la contiene).
 */
export function directSubtotal(nodes: QuoteNode[]): number {
  return round2(
    nodes.reduce(
      (sum, n) => sum + (n.kind === 'group' ? directSubtotal(n.children) : n.total),
      0,
    ),
  );
}

export function countNodes(nodes: QuoteNode[]): number {
  return nodes.reduce((n, node) => n + 1 + countNodes(node.children), 0);
}

export function treeDepth(nodes: QuoteNode[]): number {
  if (!nodes.length) return 0;
  return 1 + Math.max(...nodes.map((n) => treeDepth(n.children)));
}

/** Recorre el árbol en orden de lectura (padre antes que hijos). */
export function walk(
  nodes: QuoteNode[],
  visit: (node: QuoteNode) => void,
): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

/**
 * Reconstruye el árbol a partir de las filas planas de la base de datos.
 *
 * Las filas huérfanas (con un `parentId` que no está en el lote) se cuelgan de la
 * raíz en vez de desaparecer: perder una línea de una cotización en silencio
 * sería mucho peor que enseñarla fuera de sitio.
 */
export function rowsToTree<T extends QuoteRowLike>(rows: T[]): QuoteTreeRow<T>[] {
  const byId = new Map<string, T>(rows.map((r) => [r.id, r]));
  const childrenOf = new Map<string | null, T[]>();

  for (const row of rows) {
    const parent = row.parentId && byId.has(row.parentId) ? row.parentId : null;
    const list = childrenOf.get(parent) ?? [];
    list.push(row);
    childrenOf.set(parent, list);
  }

  const build = (
    parentId: string | null,
    parentLabel: string,
    depth: number,
  ): QuoteTreeRow<T>[] => {
    const siblings = (childrenOf.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);

    return siblings.map((row, index) => {
      const label = parentLabel ? `${parentLabel}.${index + 1}` : String(index + 1);
      return {
        row,
        label,
        depth,
        children: build(row.id, label, depth + 1),
      };
    });
  };

  return build(null, '', 0);
}

/** Aplana el árbol en orden de lectura, conservando etiqueta y profundidad. */
export function flattenTree<T extends QuoteRowLike>(
  tree: QuoteTreeRow<T>[],
): QuoteTreeRow<T>[] {
  return tree.flatMap((node) => [node, ...flattenTree(node.children)]);
}

/** Ruta de ancestros de un nodo, para el Excel: "Baño > Piso > Materiales". */
export function ancestorPath<T extends QuoteRowLike>(
  tree: QuoteTreeRow<T>[],
  targetId: string,
  separator = ' > ',
): string {
  const find = (nodes: QuoteTreeRow<T>[], trail: string[]): string | null => {
    for (const node of nodes) {
      if (node.row.id === targetId) return trail.join(separator);
      const deeper = find(node.children, [...trail, node.row.description]);
      if (deeper !== null) return deeper;
    }
    return null;
  };
  return find(tree, []) ?? '';
}
