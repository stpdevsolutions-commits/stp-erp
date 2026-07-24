'use client'

import { FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Descarga un reporte .xlsx generado por la API (ruta proxy en /api/export/...). */
export function ExportExcelButton({
  href,
  label = 'Exportar Excel',
}: {
  href: string
  label?: string
}) {
  return (
    <Button variant="outline" size="sm" render={<a href={href} download />}>
      <FileSpreadsheet className="size-4 mr-1.5" />
      {label}
    </Button>
  )
}
