'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'

/**
 * Filtro de fecha para listados. Guarda la fecha elegida en el propio campo mientras la URL se
 * actualiza: sin eso, en el celular el campo volvía a quedar vacío hasta que recargaba la página
 * y la fecha elegida no se veía. Lleva una etiqueta visible porque un campo de fecha vacío no
 * muestra nada en iPhone.
 */
export function FiltroFecha({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const [local, setLocal] = useState(value)
  const [lastProp, setLastProp] = useState(value)
  if (value !== lastProp) {
    setLastProp(value)
    setLocal(value)
  }

  return (
    <label className="flex flex-col gap-0.5 text-xs text-muted-foreground max-sm:w-full">
      {label}
      <Input
        type="date"
        value={local}
        onChange={(e) => {
          setLocal(e.target.value)
          onChange(e.target.value)
        }}
        className="w-40 max-sm:w-full"
      />
    </label>
  )
}
