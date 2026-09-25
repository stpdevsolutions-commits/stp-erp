'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, Check, Info, Sparkles, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { approvePriceImport, updatePriceImportLine } from '@/lib/actions/price-imports'
import type {
  Material,
  MaterialCategory,
  PriceImportLine,
  PriceImportLineUpdate,
  Unit,
} from '@/lib/types'
import { LINE_STATUS } from './import-labels'
import { CrearMaterialLineaDialog } from './crear-material-linea-dialog'
import { CrearMaterialesFaltantesDialog } from './crear-materiales-faltantes-dialog'
import { esErrorDeVersion, MENSAJE_VERSION } from '@/components/version-guard'

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

type Filtro = 'todos' | 'sin-material' | 'listos'

/**
 * Revisión línea por línea de lo que extrajo la IA.
 *
 * El botón de aprobar manda la lista explícita de ids: no existe un "aprobar todo lo
 * que haya" que pudiera arrastrar líneas que nadie miró. Una línea sin material
 * asignado no se puede marcar, porque no hay dónde registrar su precio — por eso cada
 * renglón sin material ofrece las tres salidas: aceptar una sugerencia, buscar en el
 * catálogo o crear el material nuevo.
 */
export function RevisionLineas({
  importId,
  lines,
  materials,
  units,
  categories,
  documentDate,
  supplierName,
}: {
  importId: string
  lines: PriceImportLine[]
  materials: Material[]
  units: Unit[]
  categories: MaterialCategory[]
  documentDate?: string
  supplierName?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busyLine, setBusyLine] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resumen, setResumen] = useState<string | null>(null)
  const [filtroMaterial, setFiltroMaterial] = useState<Record<string, string>>({})
  const [filtro, setFiltro] = useState<Filtro>('todos')

  const activos = useMemo(() => materials.filter((m) => m.isActive), [materials])
  const revisables = lines.filter((l) => l.status === 'pending')
  const listos = revisables.filter((l) => l.materialId)
  const sinMaterial = revisables.filter((l) => !l.materialId)
  const aprobadas = lines.filter((l) => l.status === 'approved').length
  const descartadas = lines.filter((l) => l.status === 'rejected').length

  const visibles = lines.filter((l) =>
    filtro === 'sin-material'
      ? l.status === 'pending' && !l.materialId
      : filtro === 'listos'
        ? l.status === 'pending' && !!l.materialId
        : true,
  )

  function toggle(lineId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(lineId)) next.delete(lineId)
      else next.add(lineId)
      return next
    })
  }

  /** Marca todas las que se PUEDEN aprobar: pendientes y con material asignado. */
  function toggleTodas() {
    const elegibles = listos.map((l) => l.id)
    setSelected((prev) => (prev.size === elegibles.length ? new Set() : new Set(elegibles)))
  }

  async function guardarLinea(lineId: string, input: PriceImportLineUpdate) {
    setBusyLine(lineId)
    setError(null)
    const result = await updatePriceImportLine(importId, lineId, input).catch((err: unknown) => ({
      ok: false,
      error: esErrorDeVersion(err) ? MENSAJE_VERSION : 'Error de conexión',
    }))
    setBusyLine(null)
    if (!result.ok) {
      setError(result.error ?? 'No se pudo guardar')
      return
    }
    // Recién asignado = listo para aprobar: se deja marcado para no obligar a un
    // segundo clic por renglón. Al quitar el material o descartar, se desmarca.
    setSelected((prev) => {
      const next = new Set(prev)
      if (input.materialId) next.add(lineId)
      else next.delete(lineId)
      return next
    })
    startTransition(() => router.refresh())
  }

  async function aprobar() {
    if (selected.size === 0) return
    setError(null)
    setResumen(null)
    const result = await approvePriceImport(importId, [...selected]).catch((err: unknown) => ({
      ok: false as const,
      error: esErrorDeVersion(err) ? MENSAJE_VERSION : 'Error de conexión',
      result: undefined,
    }))
    if (!result.ok) {
      setError(result.error ?? 'No se pudo aprobar')
      return
    }
    const { created = 0, skipped = [] } = result.result ?? {}
    setResumen(
      skipped.length === 0
        ? `${created} precio(s) registrado(s) en el catálogo.`
        : `${created} precio(s) registrado(s). ${skipped.length} línea(s) no entraron: ` +
            skipped.map((s) => s.reason).join('; '),
    )
    setSelected(new Set())
    startTransition(() => router.refresh())
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Renglones de la cotización</CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">
              Los precios entran como{' '}
              {supplierName ? `precios de ${supplierName}` : 'precios sin proveedor'}
              {documentDate ? `, con fecha ${documentDate}` : ' con la fecha de hoy'}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={toggleTodas} disabled={listos.length === 0}>
              Seleccionar los listos ({listos.length})
            </Button>
            <Button size="sm" onClick={aprobar} disabled={selected.size === 0 || pending}>
              <Check className="size-4" />
              Aprobar {selected.size > 0 ? `${selected.size} precio(s)` : ''}
            </Button>
          </div>
        </div>

        {/* Resumen + filtro: con 100+ renglones hay que poder ir directo a lo que falta. */}
        <div className="flex flex-wrap gap-2 text-sm">
          {(
            [
              ['todos', `Todos (${lines.length})`],
              ['sin-material', `Sin material (${sinMaterial.length})`],
              ['listos', `Listos para aprobar (${listos.length})`],
            ] as [Filtro, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFiltro(k)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium',
                filtro === k ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              {label}
            </button>
          ))}
          <span className="text-muted-foreground self-center text-xs">
            · {aprobadas} aprobado(s) · {descartadas} descartado(s)
          </span>
        </div>

        {sinMaterial.length > 0 && (
          <div className="bg-muted/50 flex flex-col gap-3 rounded-md p-3 sm:flex-row sm:items-center">
            <p className="text-muted-foreground flex flex-1 gap-2 text-xs leading-relaxed">
              <Info className="mt-0.5 size-4 shrink-0" />
              <span>
                Un renglón solo se puede aprobar si está ligado a un <strong>material del catálogo</strong>{' '}
                (ahí se guarda su precio). A los {sinMaterial.length} que no lo tienen: toca una
                sugerencia, búscalo, o <strong>créalos desde esta cotización</strong> si el catálogo no
                los tiene. Lo que no quieras registrar, descártalo con la ✕.
              </span>
            </p>
            <CrearMaterialesFaltantesDialog
              importId={importId}
              lines={sinMaterial}
              units={units}
              categories={categories}
              onDone={(creados) => {
                // Recién creados = listos para aprobar: quedan marcados.
                setSelected((prev) => new Set([...prev, ...creados]))
                startTransition(() => router.refresh())
              }}
            />
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {error && (
          <p className="text-destructive flex items-center gap-1.5 text-sm">
            <AlertTriangle className="size-4 shrink-0" />
            {error}
          </p>
        )}
        {resumen && <p className="text-sm font-medium">{resumen}</p>}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Lo que dice la cotización</TableHead>
                <TableHead>Material del catálogo</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground py-8 text-center text-sm">
                    Nada en este filtro.
                  </TableCell>
                </TableRow>
              )}
              {visibles.map((line) => {
                const estado = LINE_STATUS[line.status]
                const editable = line.status === 'pending'
                const filtroTxt = (filtroMaterial[line.id] ?? '').trim().toLowerCase()
                const opciones = filtroTxt
                  ? activos
                      .filter((m) =>
                        `${m.code} ${m.name} ${m.brand ?? ''}`.toLowerCase().includes(filtroTxt),
                      )
                      .slice(0, 25)
                  : []
                const sugerencias = line.suggestions ?? []

                return (
                  <TableRow key={line.id} className={editable ? undefined : 'opacity-60'}>
                    <TableCell>
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={selected.has(line.id)}
                        disabled={!editable || !line.materialId}
                        onChange={() => toggle(line.id)}
                        aria-label={`Aprobar ${line.rawDescription}`}
                        title={!line.materialId && editable ? 'Asígnale un material primero' : undefined}
                      />
                    </TableCell>

                    <TableCell className="max-w-sm">
                      <p className="text-sm">{line.rawDescription}</p>
                      <p className="text-muted-foreground text-xs">
                        {[line.rawCode, line.rawUnit].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </TableCell>

                    <TableCell className="min-w-[18rem]">
                      {line.material ? (
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/dashboard/costos/materiales/${line.material.id}`}
                            className="text-sm underline-offset-4 hover:underline"
                          >
                            {line.material.name}
                          </Link>
                          {line.material.unit && (
                            <span className="text-muted-foreground text-xs">({line.material.unit.name})</span>
                          )}
                          {editable && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Quitar el material"
                              disabled={busyLine === line.id}
                              onClick={() => guardarLinea(line.id, { materialId: null })}
                            >
                              <X className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      ) : editable ? (
                        <div className="space-y-1.5">
                          {sugerencias.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {sugerencias.map((s) => (
                                <button
                                  key={s.id}
                                  type="button"
                                  disabled={busyLine === line.id}
                                  onClick={() => guardarLinea(line.id, { materialId: s.id })}
                                  className="border-primary/40 bg-primary/5 hover:bg-primary/10 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs"
                                  title={`${s.code} · coincide ${Math.round(s.score * 100)}%`}
                                >
                                  <Sparkles className="text-primary size-3" />
                                  ¿Es {s.name}?
                                </button>
                              ))}
                            </div>
                          )}
                          <Input
                            value={filtroMaterial[line.id] ?? ''}
                            onChange={(e) =>
                              setFiltroMaterial((prev) => ({ ...prev, [line.id]: e.target.value }))
                            }
                            placeholder={sugerencias.length ? 'O busca otro material…' : 'Buscar en el catálogo…'}
                            className="h-8 text-sm"
                          />
                          {opciones.length > 0 && (
                            <ul className="border-border max-h-40 overflow-y-auto rounded-md border text-sm">
                              {opciones.map((m) => (
                                <li key={m.id}>
                                  <button
                                    type="button"
                                    className="hover:bg-muted w-full px-2 py-1 text-left"
                                    disabled={busyLine === line.id}
                                    onClick={() => guardarLinea(line.id, { materialId: m.id })}
                                  >
                                    {m.code} · {m.name}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                          <div className="flex items-center gap-2">
                            <CrearMaterialLineaDialog
                              importId={importId}
                              line={line}
                              units={units}
                              categories={categories}
                              onCreated={() => {
                                setSelected((prev) => new Set(prev).add(line.id))
                                startTransition(() => router.refresh())
                              }}
                            />
                            {sugerencias.length === 0 && (
                              <span className="text-muted-foreground text-xs">No está en el catálogo</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>

                    <TableCell className="text-right text-sm whitespace-nowrap">
                      {line.currency === 'DOP'
                        ? DOP.format(line.price)
                        : `US$ ${line.price.toLocaleString('es-DO')}`}
                      {line.itbisIncluded && (
                        <span className="text-muted-foreground block text-xs">ITBIS incluido</span>
                      )}
                      {line.discountPct > 0 && (
                        <span className="text-muted-foreground block text-xs">
                          −{line.discountPct}%
                        </span>
                      )}
                      {line.currency !== 'DOP' && (
                        <div className="mt-1 flex items-center justify-end gap-1">
                          <span className="text-muted-foreground text-xs">Tasa</span>
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            defaultValue={line.exchangeRate ?? ''}
                            disabled={!editable || busyLine === line.id}
                            placeholder="RD$ x USD"
                            className="h-7 w-24 text-right text-xs"
                            onBlur={(e) => {
                              const value = e.target.value ? Number(e.target.value) : undefined
                              if (value !== line.exchangeRate) {
                                guardarLinea(line.id, { exchangeRate: value })
                              }
                            }}
                          />
                        </div>
                      )}
                    </TableCell>

                    <TableCell>
                      <Badge variant={estado.variant}>{estado.label}</Badge>
                      {line.createdPriceId && (
                        <Check className="text-muted-foreground ml-1 inline size-3" />
                      )}
                    </TableCell>

                    <TableCell>
                      {editable && (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Descartar este renglón (no se registra su precio)"
                          disabled={busyLine === line.id}
                          onClick={() => guardarLinea(line.id, { status: 'rejected' })}
                        >
                          <X className="size-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
