import Link from 'next/link'
import { AlertTriangle, FileText } from 'lucide-react'
import { api, pageError } from '@/lib/api'
import type { PaginatedResponse, PriceImport, Supplier } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Paginacion } from '@/components/ui/paginacion'
import { SubirCotizacionDialog } from '@/components/costos/subir-cotizacion-dialog'
import { AutoRefresh } from '@/components/costos/auto-refresh'
import { IMPORT_STATUS } from '@/components/costos/import-labels'

const LIMIT = 25

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('es-DO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default async function ImportarPreciosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.page ?? '1'))

  let res: PaginatedResponse<PriceImport> = { data: [], total: 0, page: 1, limit: LIMIT }
  let error: string | null = null

  try {
    res = await api.get<PaginatedResponse<PriceImport>>(
      `/costs/price-imports?page=${page}&limit=${LIMIT}`,
    )
  } catch (e) {
    error = pageError(e, 'Error al cargar las importaciones')
  }

  const suppliers = await api
    .get<PaginatedResponse<Supplier>>('/suppliers?limit=200')
    .then((r) => r.data)
    .catch(() => [] as Supplier[])

  // Mientras haya un lote en la cola la página se refresca sola: el resultado llega
  // minutos después y nadie debería quedarse pulsando F5.
  const enCurso = res.data.some((i) => i.status === 'pending' || i.status === 'processing')

  return (
    <div className="space-y-6">
      {enCurso && <AutoRefresh intervalMs={5000} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Importar precios</h1>
          <p className="text-muted-foreground text-sm">
            Sube la cotización del proveedor en PDF. La IA extrae los renglones y{' '}
            <strong>tú apruebas</strong> cuáles entran al historial.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/costos/materiales"
            className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
          >
            Materiales
          </Link>
          <SubirCotizacionDialog suppliers={suppliers} />
        </div>
      </div>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="text-destructive flex items-center gap-2 py-4 text-sm">
            <AlertTriangle className="size-4 shrink-0" />
            {error}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {res.data.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-sm">
              <FileText className="size-8 opacity-40" />
              <p>Todavía no has importado ninguna cotización.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Documento</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Subido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {res.data.map((imp) => {
                    const estado = IMPORT_STATUS[imp.status]
                    return (
                      <TableRow key={imp.id}>
                        <TableCell>
                          <Link
                            href={`/dashboard/costos/importar/${imp.id}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {imp.originalName}
                          </Link>
                          {imp.error && (
                            <p className="text-destructive mt-0.5 text-xs">{imp.error}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {imp.supplier?.name ?? '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={estado.variant}>{estado.label}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-right text-sm">
                          {formatDate(imp.createdAt)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Paginacion total={res.total} page={page} limit={LIMIT} />
    </div>
  )
}
