'use client'

import { useState } from 'react'
import {
  Plus,
  Trash2,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  Calculator,
  AlertTriangle,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  type EditorNode,
  addChild,
  makeGroup,
  makeItem,
  nodeLabel,
  nodeTotal,
  removeNode,
  treeSubtotal,
  updateNode,
} from '@/lib/quote-tree'
import type { Acu } from '@/lib/types'
import { AcuPickerDialog } from '@/components/quotes/acu-picker-dialog'

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

export const UNITS = [
  { value: 'unid',     label: 'Unid.' },
  { value: 'm',        label: 'm (Metro)' },
  { value: 'm2',       label: 'm² (M. cuadrado)' },
  { value: 'm3',       label: 'm³ (M. cúbico)' },
  { value: 'kg',       label: 'kg (Kilogramo)' },
  { value: 'lb',       label: 'lb (Libra)' },
  { value: 'hr',       label: 'hr (Hora)' },
  { value: 'dia',      label: 'día' },
  { value: 'pie',      label: 'pie' },
  { value: 'pulg',     label: 'pulg. (Pulgada)' },
  { value: 'gl',       label: 'gl (Galón)' },
  { value: 'lt',       label: 'lt (Litro)' },
  { value: 'rollo',    label: 'rollo' },
  { value: 'caja',     label: 'caja' },
  { value: 'juego',    label: 'juego' },
  { value: 'servicio', label: 'servicio' },
  { value: 'otro',     label: 'otro' },
]

/**
 * Editor del árbol de partidas de una cotización.
 *
 * Una partida puede contener subpartidas y estas, más subpartidas o líneas:
 * "Baño" → "Piso" → (cerámica, mortero, mano de obra). El total de una partida
 * es siempre la suma de lo que cuelga de ella, nunca un número que se teclee.
 */
export function PartidasEditor({
  nodes,
  onChange,
  acus = [],
}: {
  nodes: EditorNode[]
  onChange: (next: EditorNode[]) => void
  /** Partidas de costos disponibles para calcular unitarios. Vacío = solo precio a mano. */
  acus?: Acu[]
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>
          Partidas e ítems <span className="text-destructive">*</span>
        </Label>
        <span className="text-xs text-muted-foreground">
          Una partida puede dividirse en subpartidas
        </span>
      </div>

      {nodes.map((node, index) => (
        <NodeBlock
          key={node.id}
          node={node}
          label={nodeLabel('', index)}
          depth={0}
          canDelete={nodes.length > 1}
          onChange={onChange}
          nodes={nodes}
          acus={acus}
        />
      ))}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => onChange(addChild(nodes, null, makeGroup()))}
        >
          <FolderPlus className="size-4 mr-1.5" />
          Agregar partida
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(addChild(nodes, null, makeItem()))}
        >
          <Plus className="size-4 mr-1.5" />
          Ítem suelto
        </Button>
      </div>

      <div className="flex justify-end text-sm">
        <span className="text-muted-foreground mr-3">Suma de partidas</span>
        <span className="font-semibold tabular-nums">{DOP.format(treeSubtotal(nodes))}</span>
      </div>
    </div>
  )
}

/** Un nodo del árbol: partida (con cabecera y sus hijos) o línea. */
function NodeBlock({
  node,
  label,
  depth,
  canDelete,
  nodes,
  onChange,
  acus,
}: {
  node: EditorNode
  label: string
  depth: number
  canDelete: boolean
  nodes: EditorNode[]
  onChange: (next: EditorNode[]) => void
  acus: Acu[]
}) {
  const [collapsed, setCollapsed] = useState(false)
  const isGroup = node.children.length > 0 || node.kind === 'group'

  const set = (patch: Partial<EditorNode>) => onChange(updateNode(nodes, node.id, patch))
  const remove = () => onChange(removeNode(nodes, node.id))

  if (!isGroup) {
    return (
      <ItemRow
        node={node}
        label={label}
        depth={depth}
        canDelete
        onChange={onChange}
        nodes={nodes}
        acus={acus}
      />
    )
  }

  return (
    <div
      className="border rounded-lg overflow-hidden"
      style={{ marginLeft: depth > 0 ? 12 : 0 }}
    >
      <div className="flex flex-wrap items-center gap-2 px-2 py-2 bg-muted/60 border-b">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Desplegar partida' : 'Plegar partida'}
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
        </Button>

        <span className="text-xs font-semibold text-muted-foreground shrink-0 tabular-nums">
          {label}
        </span>

        <Input
          value={node.description}
          onChange={(e) => set({ description: e.target.value })}
          className="h-7 text-sm font-semibold border-0 shadow-none focus-visible:ring-0 px-1 bg-transparent flex-1 min-w-40"
          placeholder={depth === 0 ? 'Nombre de la partida (ej. Baño)' : 'Subpartida (ej. Piso)'}
        />

        <span className="text-sm font-semibold tabular-nums shrink-0 px-2">
          {DOP.format(nodeTotal(node))}
        </span>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() => onChange(addChild(nodes, node.id, makeItem()))}
        >
          <Plus className="size-3.5 mr-1" />
          Ítem
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() => onChange(addChild(nodes, node.id, makeGroup()))}
        >
          <FolderPlus className="size-3.5 mr-1" />
          Subpartida
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-destructive"
          onClick={remove}
          disabled={!canDelete}
          aria-label="Eliminar partida"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {!collapsed && (
        <div className="p-2 space-y-2">
          {node.children.length === 0 && (
            <p className="text-xs text-muted-foreground px-1 py-2">
              Partida vacía: agrégale un ítem o una subpartida.
            </p>
          )}
          {node.children.map((child, index) => (
            <NodeBlock
              key={child.id}
              node={child}
              label={nodeLabel(label, index)}
              depth={depth + 1}
              canDelete
              nodes={nodes}
              onChange={onChange}
              acus={acus}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Línea con cantidad × precio. */
function ItemRow({
  node,
  label,
  depth,
  canDelete,
  nodes,
  onChange,
  acus,
}: {
  node: EditorNode
  label: string
  depth: number
  canDelete: boolean
  nodes: EditorNode[]
  onChange: (next: EditorNode[]) => void
  acus: Acu[]
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const set = (patch: Partial<EditorNode>) => onChange(updateNode(nodes, node.id, patch))

  return (
    <div style={{ marginLeft: depth > 0 ? 12 : 0 }}>
    <div className="grid grid-cols-12 gap-2 items-center">
      <span className="col-span-12 sm:col-span-1 text-xs text-muted-foreground tabular-nums">
        {label}
      </span>

      <Input
        value={node.description}
        onChange={(e) => set({ description: e.target.value })}
        placeholder="Descripción"
        className="col-span-12 sm:col-span-4 h-8 text-sm"
      />

      <Input
        type="number"
        step="0.01"
        min="0"
        value={node.quantity}
        onChange={(e) => set({ quantity: e.target.value })}
        placeholder="Cant."
        className="col-span-4 sm:col-span-1 h-8 text-sm"
      />

      <div className="col-span-8 sm:col-span-2">
        <Select
          value={node.unit || 'unid'}
          onValueChange={(v) => v && set({ unit: v })}
        >
          <SelectTrigger className="w-full h-8 text-sm">
            <SelectValue placeholder="Unidad" />
          </SelectTrigger>
          <SelectContent>
            {UNITS.map((u) => (
              <SelectItem key={u.value} value={u.value}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="col-span-6 sm:col-span-2 flex items-center gap-1">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={node.unitPrice}
          onChange={(e) => set({ unitPrice: e.target.value })}
          placeholder={node.acu ? 'Se calcula' : 'Precio'}
          className="h-8 text-sm flex-1 min-w-0"
        />
        {acus.length > 0 && (
          <Button
            type="button"
            variant={node.acu ? 'secondary' : 'ghost'}
            size="icon-sm"
            className="shrink-0"
            onClick={() => setPickerOpen(true)}
            aria-label={
              node.acu ? 'Cambiar la partida de costos' : 'Calcular el precio desde una partida de costos'
            }
            title={
              node.acu
                ? `Calculado desde ${node.acu.acuCode || 'una partida de costos'}`
                : 'Calcular desde una partida de costos'
            }
          >
            <Calculator className="size-4" />
          </Button>
        )}
      </div>

      <Input
        type="number"
        step="0.01"
        min="0"
        max="100"
        value={node.discountPct}
        onChange={(e) => set({ discountPct: e.target.value })}
        placeholder="Desc.%"
        className="col-span-4 sm:col-span-1 h-8 text-sm"
      />

      <div className="col-span-2 sm:col-span-1 flex items-center justify-end gap-1">
        <span className="text-xs tabular-nums text-muted-foreground truncate">
          {DOP.format(nodeTotal(node))}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-destructive shrink-0"
          onClick={() => onChange(removeNode(nodes, node.id))}
          disabled={!canDelete}
          aria-label="Eliminar ítem"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>

      {/*
        Franja de origen del precio. Se enseña siempre que la línea venga de un ACU:
        que un unitario esté calculado (y con qué margen) no puede ser invisible al
        editar, o alguien lo pisa a mano sin saber lo que deshace.
      */}
      {node.acu && (
        <div className="flex flex-wrap items-center gap-2 mt-1 ml-1 text-xs text-muted-foreground">
          <Calculator className="size-3.5 shrink-0" />
          <span className="truncate">
            {node.acu.acuCode ? `${node.acu.acuCode} · ` : ''}
            {node.acu.acuName}
          </span>
          {node.acu.unitCost != null && (
            <span className="tabular-nums">
              costo {DOP.format(node.acu.unitCost)}
              {Number(node.acu.markupPct) > 0 ? ` + ${node.acu.markupPct}%` : ' sin margen'}
            </span>
          )}
          {node.acu.unitCost == null && (
            <span>se calculará al guardar</span>
          )}
          {node.acu.incomplete && (
            <span className="text-destructive inline-flex items-center gap-1">
              <AlertTriangle className="size-3.5" />
              precio mínimo: faltan precios de material
            </span>
          )}
          <button
            type="button"
            onClick={() => set({ acu: null })}
            className="inline-flex items-center gap-0.5 hover:text-foreground underline"
            title="Desenlazar: el unitario pasa a escribirse a mano y se conserva el número actual"
          >
            <X className="size-3" />
            desenlazar
          </button>
        </div>
      )}

      <AcuPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        acus={acus}
        current={node.acu}
        onSelect={(acu, unitPrice) => set({ acu, unitPrice: String(unitPrice) })}
      />
    </div>
  )
}
