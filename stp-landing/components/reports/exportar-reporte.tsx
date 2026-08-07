import { FileSpreadsheet, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Botones de exportación del reporte que se está viendo.
 *
 * Llevan los mismos filtros que la pantalla (`from`/`to`, o el id del proyecto o
 * cliente): el archivo tiene que decir exactamente lo que hay a la vista, no el
 * reporte por defecto.
 */
export function ExportarReporte({
  tipo,
  id,
  from,
  to,
}: {
  tipo: 'general' | 'ingresos' | 'gastos' | 'fichas' | 'proyecto' | 'cliente'
  id?: string
  from?: string
  to?: string
}) {
  const params = new URLSearchParams({ tipo })
  if (id) params.set('id', id)
  if (from) params.set('from', from)
  if (to) params.set('to', to)

  const href = (format: 'pdf' | 'xlsx') => `/api/export/reporte?${params}&format=${format}`

  return (
    <div className="flex items-center gap-2">
      {/* El PDF se abre en pestaña nueva: es para mirarlo e imprimirlo. */}
      <Button
        variant="outline"
        size="sm"
        render={<a href={href('pdf')} target="_blank" rel="noopener noreferrer" />}
      >
        <FileText className="size-4 mr-1.5" />
        PDF
      </Button>
      <Button variant="outline" size="sm" render={<a href={href('xlsx')} download />}>
        <FileSpreadsheet className="size-4 mr-1.5" />
        Excel
      </Button>
    </div>
  )
}
