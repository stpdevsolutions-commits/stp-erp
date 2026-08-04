'use client'

import * as React from 'react'
import { Combobox } from '@base-ui/react/combobox'
import { ChevronDownIcon, CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface OpcionBuscador {
  value: string
  label: string
  /** Texto secundario (código, cliente...). También cuenta para la búsqueda. */
  hint?: string
}

/**
 * Selector con buscador: se escribe parte del nombre y la lista se filtra.
 *
 * Existe porque en listas largas —clientes, proyectos— un `Select` obliga a
 * recorrer decenas de opciones a ojo. Se apoya en el Combobox de Base UI, que
 * ya trae el filtrado, el teclado y la accesibilidad; aquí solo se le pone el
 * estilo del resto de campos y se traduce de objeto a id, porque los
 * formularios guardan el id y no el objeto.
 */
export function BuscadorSelect({
  opciones,
  value,
  onValueChange,
  placeholder = 'Buscar…',
  vacio = 'Sin resultados',
  disabled,
  id,
  className,
}: {
  opciones: OpcionBuscador[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  vacio?: string
  disabled?: boolean
  id?: string
  className?: string
}) {
  const seleccion = React.useMemo(
    () => opciones.find((o) => o.value === value) ?? null,
    [opciones, value],
  )

  return (
    <Combobox.Root
      items={opciones}
      value={seleccion}
      onValueChange={(item: OpcionBuscador | null) => onValueChange(item?.value ?? '')}
      itemToStringLabel={(item: OpcionBuscador) =>
        item.hint ? `${item.label} ${item.hint}` : item.label
      }
      disabled={disabled}
    >
      <Combobox.InputGroup
        className={cn(
          'flex h-9 w-full items-center gap-1 rounded-lg border border-input bg-transparent pr-1 pl-2.5 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-disabled:cursor-not-allowed has-disabled:opacity-50 dark:bg-input/30',
          className,
        )}
      >
        <Combobox.Input
          id={id}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
        <Combobox.Trigger
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          aria-label="Ver opciones"
        >
          <ChevronDownIcon className="size-4" />
        </Combobox.Trigger>
      </Combobox.InputGroup>

      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="z-50">
          <Combobox.Popup className="max-h-64 w-[var(--anchor-width)] overflow-y-auto overscroll-contain rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
            <Combobox.Empty className="px-2 py-3 text-center text-sm text-muted-foreground">
              {vacio}
            </Combobox.Empty>
            <Combobox.List>
              {(item: OpcionBuscador) => (
                <Combobox.Item
                  key={item.value}
                  value={item}
                  className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <Combobox.ItemIndicator className="flex size-4 shrink-0 items-center justify-center">
                    <CheckIcon className="size-4" />
                  </Combobox.ItemIndicator>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{item.label}</span>
                    {item.hint && (
                      <span className="truncate text-xs text-muted-foreground">{item.hint}</span>
                    )}
                  </span>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
