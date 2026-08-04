import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { Material, PaginatedResponse, PriceImport } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AutoRefresh } from '@/components/costos/auto-refresh'
import { RevisionLineas } from '@/components/costos/revision-lineas'
import { IMPORT_STATUS } from '@/components/costos/import-labels'

export default async function ImportacionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let imp: PriceImport
  try {
    imp = await api.get<PriceImport>(`/costs/price-imports/${id}`)
  } catch {
    notFound()
  }

  const materials = await api
    .get<PaginatedResponse<Material>>('/costs/materials?limit=500')
    .then((r) => r.data)
    .catch(() => [] as Material[])

  const estado = IMPORT_STATUS[imp.status]
  const enCurso = imp.status === 'pending' || imp.status === 'processing'
  const lines = imp.lines ?? []
  const pendientes = lines.filter((l) => l.status === 'pending').length
  const aprobadas = lines.filter((l) => l.status === 'approved').length

  return (
    <div className="space-y-6">
      {enCurso && <AutoRefresh intervalMs={5000} />}

      <div className="space-y-2">
        <Link
          href="/dashboard/costos/importar"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" />
          Importaciones
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{imp.originalName}</h1>
            <p className="text-muted-foreground text-sm">
              {imp.supplier?.name ?? 'Sin proveedor'}
              {imp.documentDate && ` · documento del ${imp.documentDate}`}
              {lines.length > 0 &&
                ` · ${lines.length} renglón(es), ${aprobadas} aprobado(s), ${pendientes} pendiente(s)`}
            </p>
          </div>
          <Badge variant={estado.variant}>{estado.label}</Badge>
        </div>
      </div>

      {enCurso && (
        <Card>
          <CardContent className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Leyendo el documento. Puede tardar unos minutos; esta página se actualiza sola.
          </CardContent>
        </Card>
      )}

      {imp.status === 'failed' && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2 text-base">
              <AlertTriangle className="size-4" />
              La extracción falló
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p>{imp.error ?? 'Sin detalle'}</p>
            <p className="text-muted-foreground mt-2">
              Vuelve a subir el documento, o registra los precios a mano desde el material.
            </p>
          </CardContent>
        </Card>
      )}

      {imp.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notas de la extracción</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-muted-foreground overflow-x-auto text-xs whitespace-pre-wrap">
              {imp.notes}
            </pre>
          </CardContent>
        </Card>
      )}

      {lines.length > 0 && (
        <RevisionLineas
          importId={imp.id}
          lines={lines}
          materials={materials}
          documentDate={imp.documentDate}
          supplierName={imp.supplier?.name}
        />
      )}

      {imp.model && (
        <p className="text-muted-foreground text-xs">
          Extraído con {imp.model} · {imp.inputTokens.toLocaleString('es-DO')} tokens de
          entrada, {imp.outputTokens.toLocaleString('es-DO')} de salida
        </p>
      )}
    </div>
  )
}
