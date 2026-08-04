import type { Quote, QuoteItem } from '@/lib/types'

/**
 * Árbol de partidas de una cotización, lado cliente.
 *
 * Espeja lo que hace `stp-api/src/quotes/quote-tree.ts`: el servidor recalcula
 * todo al guardar, así que estos totales son solo la vista previa mientras se
 * edita. Si los dos cálculos discrepan, manda el del servidor.
 */

export type NodeKind = 'group' | 'item'

/**
 * Enlace de una línea con la partida de costos (ACU) de la que sale su unitario.
 *
 * `unitCost` es la pieza delicada: cuando ya tiene valor, es el CONGELADO que vino de
 * la API y viaja de vuelta tal cual para que el servidor lo conserve. Si se perdiera
 * aquí, editar el título de una cotización revaluaría sus precios con los costos de
 * hoy — justo lo que el congelado existe para impedir.
 */
export interface EditorAcu {
  acuId: string
  /** Solo para mostrar; el servidor no los usa. */
  acuCode: string
  acuName: string
  /** Texto porque sale de un <input>. */
  markupPct: string
  /** Congelado ya existente. `null` = línea nueva: lo congela el servidor al guardar. */
  unitCost: number | null
  pricedAt: string | null
  incomplete: boolean
}

/** Nodo del editor: los importes viven como texto porque salen de <input>. */
export interface EditorNode {
  id: string
  kind: NodeKind
  description: string
  unit: string
  quantity: string
  unitPrice: string
  discountPct: string
  /** null = el unitario se escribe a mano, como siempre. */
  acu: EditorAcu | null
  children: EditorNode[]
}

export interface QuoteTreeNode {
  item: QuoteItem
  label: string
  depth: number
  children: QuoteTreeNode[]
}

export function genId(): string {
  return Math.random().toString(36).slice(2, 9)
}

export function makeItem(): EditorNode {
  return {
    id: genId(),
    kind: 'item',
    description: '',
    unit: '',
    quantity: '1',
    unitPrice: '',
    discountPct: '',
    acu: null,
    children: [],
  }
}

export function makeGroup(name = ''): EditorNode {
  return {
    id: genId(),
    kind: 'group',
    description: name,
    unit: '',
    quantity: '',
    unitPrice: '',
    discountPct: '',
    acu: null,
    children: [makeItem()],
  }
}

const num = (v: string | number | undefined | null): number => {
  const n = typeof v === 'number' ? v : parseFloat(v ?? '')
  return Number.isFinite(n) ? n : 0
}

const round2 = (v: number): number =>
  Math.round(Number((v || 0).toPrecision(12)) * 100) / 100

/** Total de una línea: cantidad × unitario menos el descuento porcentual. */
export function nodeLineTotal(node: EditorNode): number {
  const disc = Math.min(100, Math.max(0, num(node.discountPct)))
  return round2(num(node.quantity) * num(node.unitPrice) * (1 - disc / 100))
}

/** Total de cualquier nodo: la línea o la suma de los descendientes del grupo. */
export function nodeTotal(node: EditorNode): number {
  if (node.children.length > 0) {
    return round2(node.children.reduce((sum, child) => sum + nodeTotal(child), 0))
  }
  return node.kind === 'group' ? 0 : nodeLineTotal(node)
}

/** Subtotal de la cotización: solo las hojas, para no contar dos veces. */
export function treeSubtotal(nodes: EditorNode[]): number {
  return round2(nodes.reduce((sum, n) => sum + nodeTotal(n), 0))
}

/** Numeración jerárquica visible: "1", "1.2", "1.2.3". */
export function nodeLabel(parentLabel: string, index: number): string {
  return parentLabel ? `${parentLabel}.${index + 1}` : String(index + 1)
}

// ── Mutaciones inmutables por id ──────────────────────────────────────────────

export function updateNode(
  nodes: EditorNode[],
  id: string,
  patch: Partial<EditorNode>,
): EditorNode[] {
  return nodes.map((n) =>
    n.id === id
      ? { ...n, ...patch }
      : { ...n, children: updateNode(n.children, id, patch) },
  )
}

/** Añade un hijo al final del nodo indicado; con `parentId` null, a la raíz. */
export function addChild(
  nodes: EditorNode[],
  parentId: string | null,
  child: EditorNode,
): EditorNode[] {
  if (parentId === null) return [...nodes, child]
  return nodes.map((n) =>
    n.id === parentId
      ? { ...n, kind: 'group', children: [...n.children, child] }
      : { ...n, children: addChild(n.children, parentId, child) },
  )
}

export function removeNode(nodes: EditorNode[], id: string): EditorNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: removeNode(n.children, id) }))
}

export function countNodes(nodes: EditorNode[]): number {
  return nodes.reduce((n, node) => n + 1 + countNodes(node.children), 0)
}

export function treeDepth(nodes: EditorNode[]): number {
  if (!nodes.length) return 0
  return 1 + Math.max(...nodes.map((n) => treeDepth(n.children)))
}

// ── Conversión con la API ─────────────────────────────────────────────────────

export interface QuoteItemPayload {
  kind: NodeKind
  description: string
  unit?: string
  quantity?: number
  unitPrice?: number
  discountPct?: number
  acuId?: string
  acuMarkupPct?: number
  acuUnitCost?: number
  acuPricedAt?: string
  acuIncomplete?: boolean
  allowIncompleteAcu?: boolean
  children?: QuoteItemPayload[]
}

/**
 * Convierte el árbol del editor al cuerpo que espera la API.
 *
 * En las líneas con ACU se reenvía el congelado (`acuUnitCost`, `acuPricedAt`) cuando ya
 * existe: la API lo interpreta como "consérvalo" y no revalora. Sin esos campos volvería
 * a congelar con los costos de hoy, y guardar un cambio de título movería los precios.
 * En una línea nueva sí se omiten a propósito: ahí congelar es justo lo que se busca.
 */
export function toPayload(nodes: EditorNode[]): QuoteItemPayload[] {
  return nodes.map((n) => {
    const isGroup = n.children.length > 0 || n.kind === 'group'
    if (isGroup) {
      return {
        kind: 'group' as const,
        description: n.description,
        children: toPayload(n.children),
      }
    }

    const base = {
      kind: 'item' as const,
      description: n.description,
      unit: n.unit || undefined,
      quantity: num(n.quantity),
      unitPrice: num(n.unitPrice),
      discountPct: num(n.discountPct),
    }
    if (!n.acu) return base

    return {
      ...base,
      acuId: n.acu.acuId,
      acuMarkupPct: num(n.acu.markupPct),
      // En un enlace nuevo el unitario NO se manda: lo calcula el servidor al congelar,
      // con el costo del momento de guardar. El número que enseña el editor es una vista
      // previa, y si el costo se movió mientras el diálogo estaba abierto, mandarlo haría
      // que la línea naciera marcada como "precio escrito a mano".
      ...(n.acu.unitCost == null ? { unitPrice: undefined } : {}),
      ...(n.acu.unitCost != null
        ? {
            acuUnitCost: n.acu.unitCost,
            acuPricedAt: n.acu.pricedAt ?? undefined,
            acuIncomplete: n.acu.incomplete,
          }
        : {}),
      // Una línea nueva sobre un ACU incompleto se congela solo si se aceptó el aviso al
      // elegirlo; el diálogo no deja marcarlo sin enseñar qué materiales faltan.
      ...(n.acu.unitCost == null && n.acu.incomplete ? { allowIncompleteAcu: true } : {}),
    }
  })
}

/**
 * Reconstruye el árbol a partir de las filas planas que devuelve la API.
 * Las huérfanas se cuelgan de la raíz: perder una línea en silencio sería peor
 * que enseñarla fuera de sitio.
 */
export function itemsToTree(items: QuoteItem[] | undefined): QuoteTreeNode[] {
  if (!items?.length) return []
  const ids = new Set(items.map((i) => i.id))
  const childrenOf = new Map<string, QuoteItem[]>()

  for (const item of items) {
    const key = item.parentId && ids.has(item.parentId) ? item.parentId : '__root__'
    const list = childrenOf.get(key) ?? []
    list.push(item)
    childrenOf.set(key, list)
  }

  const build = (key: string, parentLabel: string, depth: number): QuoteTreeNode[] =>
    (childrenOf.get(key) ?? [])
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((item, index) => {
        const label = nodeLabel(parentLabel, index)
        return { item, label, depth, children: build(item.id, label, depth + 1) }
      })

  return build('__root__', '', 0)
}

export function flattenTree(tree: QuoteTreeNode[]): QuoteTreeNode[] {
  return tree.flatMap((n) => [n, ...flattenTree(n.children)])
}

/** Árbol de la API → árbol del editor, para abrir una cotización existente. */
export function editorTreeFromQuote(quote: Quote): EditorNode[] {
  const toEditor = (node: QuoteTreeNode): EditorNode => ({
    id: genId(),
    kind: node.children.length > 0 || node.item.kind === 'group' ? 'group' : 'item',
    description: node.item.description,
    unit: node.item.unit ?? '',
    quantity: node.item.quantity ? String(node.item.quantity) : '',
    unitPrice: node.item.unitPrice ? String(node.item.unitPrice) : '',
    discountPct: node.item.discountPct ? String(node.item.discountPct) : '',
    // El congelado se conserva al abrir para editar; ver `toPayload`.
    acu: node.item.acuId
      ? {
          acuId: node.item.acuId,
          acuCode: node.item.acu?.code ?? '',
          acuName: node.item.acu?.name ?? node.item.description,
          markupPct: node.item.acuMarkupPct ? String(node.item.acuMarkupPct) : '',
          unitCost: node.item.acuUnitCost ?? null,
          pricedAt: node.item.acuPricedAt ?? null,
          incomplete: node.item.acuIncomplete === true,
        }
      : null,
    children: node.children.map(toEditor),
  })

  const tree = itemsToTree(quote.items).map(toEditor)
  return tree.length > 0 ? tree : [makeGroup('Partida 1')]
}

/**
 * Valida el árbol antes de enviarlo. Devuelve el primer problema encontrado o
 * null. Las mismas reglas que aplica el servidor, para avisar sin ir y volver.
 */
export function validateTree(nodes: EditorNode[]): string | null {
  if (nodes.length === 0) return 'Agrega al menos una partida o ítem'
  if (countNodes(nodes) === 0) return 'Agrega al menos una partida o ítem'
  if (treeDepth(nodes) > 8) return 'Las partidas no pueden anidarse más de 8 niveles'
  if (countNodes(nodes) > 500) return 'Una cotización admite como máximo 500 partidas y líneas'

  let hasLeaf = false
  const check = (list: EditorNode[]): string | null => {
    for (const node of list) {
      if (!node.description.trim()) {
        return node.children.length > 0 || node.kind === 'group'
          ? 'Todas las partidas necesitan un nombre'
          : 'Todos los ítems necesitan descripción'
      }
      if (node.children.length > 0) {
        const deeper = check(node.children)
        if (deeper) return deeper
      } else if (node.kind === 'group') {
        return `La partida "${node.description}" está vacía: agrégale un ítem o elimínala`
      } else {
        hasLeaf = true
        if (num(node.quantity) <= 0) {
          return `La cantidad de "${node.description}" debe ser mayor que 0`
        }
        // Una línea recién enlazada a un ACU puede ir sin unitario: lo pone el servidor
        // al congelar el costo de la receta. Exigirlo aquí obligaría a teclear un número
        // que se va a sobrescribir.
        const priceFromAcu = node.acu !== null && node.acu.unitCost === null
        if (!priceFromAcu && (node.unitPrice === '' || num(node.unitPrice) < 0)) {
          return `El precio unitario de "${node.description}" no es válido`
        }
        if (node.unitPrice !== '' && num(node.unitPrice) < 0) {
          return `El precio unitario de "${node.description}" no es válido`
        }
      }
    }
    return null
  }

  const problem = check(nodes)
  if (problem) return problem
  if (!hasLeaf) return 'Agrega al menos un ítem con cantidad y precio'
  return null
}
