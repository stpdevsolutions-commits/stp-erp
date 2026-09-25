import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ArrowLeft, FileQuestion, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { Material, MaterialCategory, PaginatedResponse, PriceImport, Unit } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AutoRefresh } from '@/components/costos/auto-refresh'
import { RevisionLineas } from '@/components/costos/revision-lineas'
import { IMPORT_STATUS } from '@/components/costos/import-labels'
import { ImportarPasos } from '@/components/costos/importar-pasos'
import { LoteAcciones } from '@/components/costos/lote-acciones'

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

  const [materials, units, categories] = await Promise.all([
    api
      .get<PaginatedResponse<Material>>('/costs/materials?limit=500')
      .then((r) => r.data)
      .catch(() => [] as Material[]),
    api.get<Unit[]>('/costs/units').catch(() => [] as Unit[]),
    api.get<MaterialCategory[]>('/costs/material-categories').catch(() => [] as MaterialCategory[]),
  ])

  const estado = IMPORT_STATUS[imp.status]
  const enCurso = imp.status === 'pending' || imp.status === 'processing'
  const lines = imp.lines ?? []
  const pendientes = lines.filter((l) => l.status === 'pending')
  const aprobadas = lines.filter((l) => l.status === 'approved').length
  const sinMaterial = pendientes.filter((l) => !l.materialId).length
  // Leído pero sin un solo renglón: antes la página quedaba en blanco sin explicar nada.
  const vacio = imp.status === 'review' && lines.length === 0
  const puedeReintentar = imp.status === 'failed' || vacio

  const paso: 1 | 2 | 3 | 4 | 5 =
    enCurso || imp.status === 'failed' || vacio
      ? 2
      : imp.status === 'done'
        ? 5
        : sinMaterial > 0
          ? 3
          : 4

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
                ` · ${lines.length} renglón(es): ${aprobadas} aprobado(s), ${pendientes.length} por revisar`}
            </p>
          </div>
          <Badge variant={estado.variant}>{estado.label}</Badge>
        </div>
      </div>

      <ImportarPasos actual={paso} />

      {!enCurso && (
        <LoteAcciones importId={imp.id} puedeReintentar={puedeReintentar} sinMaterial={sinMaterial} />
      )}

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
              No se pudo leer el documento
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p>{imp.error ?? 'Sin detalle'}</p>
            <p className="text-muted-foreground mt-2">
              Prueba &quot;Volver a leer con IA&quot;. Si sigue fallando, registra los precios a mano
              desde el material.
            </p>
          </CardContent>
        </Card>
      )}

      {vacio && (
        <Card className="border-amber-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileQuestion className="size-4 text-amber-600" />
              La IA no encontró ningún precio en este documento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Esto pasa cuando el PDF no es una cotización con precios. Las causas más comunes:</p>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5">
              <li>
                <strong>Los precios están en 0 o vacíos</strong> (por ejemplo, una lista de
                materiales o una plantilla). Solo se importan renglones con precio.
              </li>
              <li>
                Es una <strong>foto o escaneo</strong> muy borroso, o una página sin tabla de
                artículos.
              </li>
              <li>No es de un proveedor (un presupuesto propio, un correo, etc.).</li>
            </ul>
            <p className="text-muted-foreground">
              Si el documento sí tiene precios, usa &quot;Volver a leer con IA&quot;. Si no, elimínalo.
              Para <strong>crear materiales</strong> sin precio, hazlo desde{' '}
              <Link href="/dashboard/costos/materiales" className="underline underline-offset-4">
                Catálogo → Nuevo material
              </Link>
              .
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
          units={units}
          categories={categories}
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
