'use client'

import * as React from 'react'
import { BuscadorSelect, type OpcionBuscador } from '@/components/ui/buscador-select'
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select'

/** Hasta este número de opciones basta el desplegable normal; con más se vuelve buscador. */
const UMBRAL_BUSQUEDA = 6

function textoDe(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textoDe).join('')
  if (React.isValidElement(node)) return textoDe((node.props as { children?: React.ReactNode }).children)
  return ''
}

/** Saca (valor, texto) de los `<SelectItem value="…">texto</SelectItem>` que recibe, aunque vengan en `.map`, fragmentos o condicionales. */
function opcionesDe(children: React.ReactNode): OpcionBuscador[] {
  const out: OpcionBuscador[] = []
  const visit = (node: React.ReactNode) => {
    React.Children.forEach(node, (child) => {
      if (!React.isValidElement(child)) return
      const props = child.props as { value?: unknown; children?: React.ReactNode }
      if (child.type === React.Fragment) visit(props.children)
      else if (typeof props.value === 'string') out.push({ value: props.value, label: textoDe(props.children) })
    })
  }
  visit(children)
  return out
}

/**
 * Selector de filtros: igual que `Select` (mismas opciones `<SelectItem>`), pero cuando la lista es
 * larga —clientes, proyectos, proveedores— se puede escribir para buscar. Las listas cortas (estados,
 * categorías) siguen siendo un desplegable normal para no abrir el teclado en el celular sin necesidad.
 */
export function SelectBuscable({
  value,
  onValueChange,
  placeholder,
  className,
  children,
}: {
  value: string
  onValueChange: (value: string | null) => void
  placeholder?: string
  className?: string
  children: React.ReactNode
}) {
  const opciones = React.useMemo(() => opcionesDe(children), [children])

  if (opciones.length > UMBRAL_BUSQUEDA) {
    return (
      <BuscadorSelect
        opciones={opciones}
        value={value}
        onValueChange={(v) => onValueChange(v)}
        placeholder={placeholder}
        className={className}
      />
    )
  }

  const actual = opciones.find((o) => o.value === value)?.label
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder}>{actual}</SelectValue>
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  )
}
