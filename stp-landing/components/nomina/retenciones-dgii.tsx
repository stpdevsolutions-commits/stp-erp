'use client'

import { useState } from 'react'
import { ExportExcelButton } from '@/components/ui/export-excel-button'

/** Elige el mes y descarga el Excel de retenciones de la nómina (por fecha de pago). */
export function RetencionesDgii() {
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7))
  return (
    <div className="flex items-center gap-2">
      <input
        type="month"
        value={mes}
        onChange={(e) => setMes(e.target.value)}
        aria-label="Mes de las retenciones"
        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
      />
      <ExportExcelButton href={`/api/export/nomina-retenciones?month=${mes}`} label="Retenciones DGII" />
    </div>
  )
}
