import { notFound } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { Ficha, FichaType, FichaStatus } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PrintButton } from '@/components/fichas/print-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { ChevronLeft, MapPin, Camera, User, Calendar, Zap } from 'lucide-react'

const TYPE_LABEL: Record<FichaType, string> = {
  electrico: 'Eléctrico',
  civil: 'Civil',
  electromecanico: 'Electromecánico',
  levantamiento: 'Levantamiento',
  evaluacion_danos: 'Evaluación de daños',
}

const STATUS_LABEL: Record<FichaStatus, string> = {
  borrador: 'Borrador',
  en_progreso: 'En progreso',
  enviada: 'Enviada',
}

const STATUS_VARIANT: Record<FichaStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  borrador: 'secondary',
  en_progreso: 'outline',
  enviada: 'default',
}

// ── Helpers de label ────────────────────────────────────────────────────────

const TIPO_TRABAJO: Record<string, string> = {
  instalacion_nueva: 'Instalación nueva',
  remodelacion: 'Remodelación',
  mantenimiento: 'Mantenimiento',
  diagnostico: 'Diagnóstico',
}

const FASES: Record<string, string> = {
  monofasico: 'Monofásico',
  bifasico: 'Bifásico',
  trifasico: 'Trifásico',
}

const TABLERO_TIPO: Record<string, string> = {
  principal: 'Principal',
  secundario: 'Secundario',
  distribucion: 'Distribución',
  otro: 'Otro',
}

const TABLERO_ESTADO: Record<string, string> = {
  bueno: 'Bueno',
  regular: 'Regular',
  malo: 'Malo',
  nuevo: 'Nuevo',
}

const CIRCUITO_TIPO: Record<string, string> = {
  iluminacion: 'Iluminación',
  tomacorriente: 'Tomacorriente',
  hvac: 'HVAC',
  motor: 'Motor',
  especial: 'Especial',
  otro: 'Otro',
}

const CIRCUITO_ESTADO: Record<string, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  nuevo: 'Nuevo',
  reemplazar: 'Reemplazar',
}

// ── Tipos internos para datos eléctricos ────────────────────────────────────

interface Tablero {
  id?: string; nombre?: string; tipo?: string; amperaje?: number
  voltaje?: string; fases?: string; estado?: string; observaciones?: string
}
interface Circuito {
  numero?: string; descripcion?: string; breakerA?: number
  calibreAWG?: string; longitud?: number; tipo?: string; estado?: string
}
interface Material {
  descripcion?: string; unidad?: string; cantidad?: number; observaciones?: string
}
interface ElectricData {
  tipoTrabajo?: string; voltajeServicio?: string; fases?: string
  tableros?: Tablero[]; circuitos?: Circuito[]; materiales?: Material[]
  observacionesGenerales?: string; recomendaciones?: string
}

// ── Componentes de datos por tipo ───────────────────────────────────────────

function FichaElectricaDetalle({ data }: { data: Record<string, unknown> }) {
  const d = data as ElectricData
  const tableros = d.tableros ?? []
  const circuitos = d.circuitos ?? []
  const materiales = d.materiales ?? []

  return (
    <div className="space-y-4">
      {/* Info general */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="size-4" /> Información general
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">Tipo de trabajo</dt>
              <dd className="font-medium">{TIPO_TRABAJO[d.tipoTrabajo ?? ''] ?? d.tipoTrabajo ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Voltaje de servicio</dt>
              <dd className="font-medium">{d.voltajeServicio ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Fases</dt>
              <dd className="font-medium">{FASES[d.fases ?? ''] ?? d.fases ?? '—'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Tableros */}
      {tableros.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tableros ({tableros.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Amperaje</TableHead>
                    <TableHead>Voltaje</TableHead>
                    <TableHead>Fases</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Observaciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableros.map((t, i) => (
                    <TableRow key={t.id ?? i}>
                      <TableCell className="font-medium">{t.nombre ?? '—'}</TableCell>
                      <TableCell>{TABLERO_TIPO[t.tipo ?? ''] ?? t.tipo ?? '—'}</TableCell>
                      <TableCell>{t.amperaje != null ? `${t.amperaje} A` : '—'}</TableCell>
                      <TableCell>{t.voltaje ?? '—'}</TableCell>
                      <TableCell>{FASES[t.fases ?? ''] ?? t.fases ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={t.estado === 'malo' ? 'destructive' : t.estado === 'regular' ? 'outline' : 'secondary'}>
                          {TABLERO_ESTADO[t.estado ?? ''] ?? t.estado ?? '—'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs max-w-[200px] truncate">
                        {t.observaciones ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Circuitos */}
      {circuitos.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Circuitos ({circuitos.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Breaker</TableHead>
                    <TableHead>Calibre AWG</TableHead>
                    <TableHead>Longitud</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {circuitos.map((c, i) => (
                    <TableRow key={c.numero ?? i}>
                      <TableCell className="font-mono text-xs">{c.numero ?? i + 1}</TableCell>
                      <TableCell className="font-medium">{c.descripcion ?? '—'}</TableCell>
                      <TableCell>{CIRCUITO_TIPO[c.tipo ?? ''] ?? c.tipo ?? '—'}</TableCell>
                      <TableCell>{c.breakerA != null ? `${c.breakerA} A` : '—'}</TableCell>
                      <TableCell>{c.calibreAWG ?? '—'}</TableCell>
                      <TableCell>{c.longitud != null ? `${c.longitud} m` : '—'}</TableCell>
                      <TableCell>
                        <Badge variant={c.estado === 'reemplazar' ? 'destructive' : c.estado === 'nuevo' ? 'default' : 'secondary'}>
                          {CIRCUITO_ESTADO[c.estado ?? ''] ?? c.estado ?? '—'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Materiales */}
      {materiales.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Materiales ({materiales.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Cantidad</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead>Observaciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materiales.map((m, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{m.descripcion ?? '—'}</TableCell>
                      <TableCell>{m.cantidad ?? '—'}</TableCell>
                      <TableCell>{m.unidad ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{m.observaciones ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Observaciones */}
      {(d.observacionesGenerales ?? d.recomendaciones) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Notas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {d.observacionesGenerales && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Observaciones generales</p>
                <p className="whitespace-pre-wrap">{d.observacionesGenerales}</p>
              </div>
            )}
            {d.recomendaciones && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Recomendaciones</p>
                <p className="whitespace-pre-wrap">{d.recomendaciones}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function FichaDataGeneric({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== '')
  if (entries.length === 0) return <p className="text-muted-foreground text-sm">Sin datos registrados</p>

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Datos de la ficha</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {entries.map(([key, value]) => (
            !Array.isArray(value) && typeof value !== 'object' ? (
              <div key={key}>
                <dt className="text-muted-foreground text-xs capitalize">{key.replace(/_/g, ' ')}</dt>
                <dd className="font-medium">{String(value)}</dd>
              </div>
            ) : null
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────

export default async function FichaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let ficha: Ficha
  try {
    ficha = await api.get<Ficha>(`/fichas/${id}`)
  } catch {
    notFound()
  }

  const photosCount = (ficha.photos ?? []).filter(Boolean).length

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" render={<Link href="/dashboard/fichas" />}>
          <ChevronLeft className="size-4" />
          Fichas
        </Button>
        {ficha.project && (
          <>
            <span className="text-muted-foreground text-sm">/</span>
            <Button variant="ghost" size="sm" render={<Link href={`/dashboard/proyectos/${ficha.project.id}`} />}>
              {ficha.project.code}
            </Button>
          </>
        )}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-mono text-sm text-muted-foreground">{ficha.code}</span>
            <Badge variant="outline">{TYPE_LABEL[ficha.type]}</Badge>
            <Badge variant={STATUS_VARIANT[ficha.status]}>{STATUS_LABEL[ficha.status]}</Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Ficha {TYPE_LABEL[ficha.type]}
          </h1>
          {ficha.project && (
            <p className="text-muted-foreground text-sm mt-1">
              Proyecto:{' '}
              <Link href={`/dashboard/proyectos/${ficha.project.id}`} className="text-primary hover:underline">
                {ficha.project.name}
              </Link>
            </p>
          )}
        </div>
        <PrintButton fichaId={ficha.id} code={ficha.code} />
      </div>

      {/* Info strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <User className="size-3.5" />
              <span className="text-xs">Técnico</span>
            </div>
            <p className="font-medium text-sm">
              {ficha.technician
                ? `${ficha.technician.firstName} ${ficha.technician.lastName}`
                : '—'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Calendar className="size-3.5" />
              <span className="text-xs">Creada</span>
            </div>
            <p className="font-medium text-sm">
              {new Date(ficha.createdAt).toLocaleDateString('es-DO')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Calendar className="size-3.5" />
              <span className="text-xs">Enviada</span>
            </div>
            <p className="font-medium text-sm">
              {ficha.submittedAt
                ? new Date(ficha.submittedAt).toLocaleDateString('es-DO')
                : '—'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Camera className="size-3.5" />
              <span className="text-xs">Fotos</span>
            </div>
            <p className="font-medium text-sm">{photosCount > 0 ? `${photosCount} foto(s)` : 'Sin fotos'}</p>
          </CardContent>
        </Card>
      </div>

      {/* GPS */}
      {ficha.latitude && ficha.longitude && (
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">Ubicación registrada:</span>
          <a
            href={`https://maps.google.com/?q=${ficha.latitude},${ficha.longitude}`}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline font-medium"
          >
            {Number(ficha.latitude).toFixed(6)}, {Number(ficha.longitude).toFixed(6)} — Abrir en Google Maps
          </a>
        </div>
      )}

      {/* Datos por tipo */}
      {ficha.type === 'electrico' ? (
        <FichaElectricaDetalle data={ficha.data} />
      ) : (
        <FichaDataGeneric data={ficha.data} />
      )}

      {/* Firma */}
      {ficha.signature && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Firma digital</CardTitle>
          </CardHeader>
          <CardContent>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ficha.signature}
              alt="Firma"
              className="max-h-32 border rounded-md bg-white"
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
