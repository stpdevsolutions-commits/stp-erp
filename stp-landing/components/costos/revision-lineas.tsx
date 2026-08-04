'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, Check, HelpCircle, X } from 'lucide-react'
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
import { approvePriceImport, updatePriceImportLine } from '@/lib/actions/price-imports'
import type { Material, PriceImportLine, PriceImportLineUpdate } from '@/lib/types'
import { LINE_STATUS } from './import-labels'

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

/**
 * Revisión línea por línea de lo que extrajo la IA.
 *
 * El botón de aprobar manda la lista explícita de ids: no existe un "aprobar todo lo
 * que haya" que pudiera arrastrar líneas que nadie miró. Una línea sin material
 * asignado no se puede marcar, porque no hay dónde registrar su precio.
 */
export function RevisionLineas({
  importId,
  lines,
  materials,
  documentDate,
  supplierName,
}: {
  importId: string
  lines: PriceImportLine[]
  materials: Material[]
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

  const activos = useMemo(() => materials.filter((m) => m.isActive), [materials])
  const revisables = lines.filter((l) => l.status === 'pending')

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
    const elegibles = revisables.filter((l) => l.materialId).map((l) => l.id)
    setSelected((prev) => (prev.size === elegibles.length ? new Set() : new Set(elegibles)))
  }

  async function guardarLinea(lineId: string, input: PriceImportLineUpdate) {
    setBusyLine(lineId)
    setError(null)
    const result = await updatePriceImportLine(importId, lineId, input)
    setBusyLine(null)
    if (!result.ok) {
      setError(result.error ?? 'No se pudo guardar')
      return
    }
    startTransition(() => router.refresh())
  }

  async function aprobar() {
    if (selected.size === 0) return
    setError(null)
    setResumen(null)
    const result = await approvePriceImport(importId, [...selected])
    if (!result.ok) {
      setError(result.error ?? 'No se pudo aprobar')
      return
    }
    const { created = 0, skipped = [] } = result.result ?? {}
    setResumen(
      skipped.length === 0
        ? `${created} precio(s) registrado(s).`
        : `${created} precio(s) registrado(s). ${skipped.length} línea(s) no entraron: ` +
            skipped.map((s) => s.reason).join('; '),
    )
    setSelected(new Set())
    startTransition(() => router.refresh())
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">Renglones extraídos</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            Compara cada descripción con el PDF antes de aprobar. Los precios entran como{' '}
            {supplierName ? `precios de ${supplierName}` : 'precios sin proveedor'}
            {documentDate ? `, con fecha ${documentDate}` : ' con la fecha de hoy'}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={toggleTodas} disabled={revisables.length === 0}>
            Marcar aprobables
          </Button>
          <Button size="sm" onClick={aprobar} disabled={selected.size === 0 || pending}>
            Aprobar {selected.size > 0 && `(${selected.size})`}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {error && (
          <p className="text-destructive flex items-center gap-1.5 text-sm">
            <AlertTriangle className="size-4 shrink-0" />
            {error}
          </p>
        )}
        {resumen && <p className="text-sm">{resumen}</p>}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Descripción en el documento</TableHead>
                <TableHead>Material del catálogo</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => {
                const estado = LINE_STATUS[line.status]
                const editable = line.status === 'pending'
                const filtro = (filtroMaterial[line.id] ?? '').trim().toLowerCase()
                const opciones = filtro
                  ? activos
                      .filter((m) =>
                        `${m.code} ${m.name} ${m.brand ?? ''}`.toLowerCase().includes(filtro),
                      )
                      .slice(0, 25)
                  : []

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
                      />
                    </TableCell>

                    <TableCell className="max-w-sm">
                      <p className="text-sm">{line.rawDescription}</p>
                      <p className="text-muted-foreground text-xs">
                        {[line.rawCode, line.rawUnit].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </TableCell>

                    <TableCell className="min-w-[16rem]">
                      {line.material ? (
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/dashboard/costos/materiales/${line.material.id}`}
                            className="text-sm underline-offset-4 hover:underline"
                          >
                            {line.material.name}
                          </Link>
                          {editable && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busyLine === line.id}
                              onClick={() => guardarLinea(line.id, { materialId: null })}
                            >
                              <X className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      ) : editable ? (
                        <div className="space-y-1">
                          <Input
                            value={filtroMaterial[line.id] ?? ''}
                            onChange={(e) =>
                              setFiltroMaterial((prev) => ({ ...prev, [line.id]: e.target.value }))
                            }
                            placeholder="Buscar material…"
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
                          {line.matchCount > 1 && (
                            <p className="text-muted-foreground flex items-center gap-1 text-xs">
                              <HelpCircle className="size-3" />
                              {line.matchCount} materiales parecidos: elige tú
                            </p>
                          )}
                          {line.matchCount === 0 && (
                            <p className="text-muted-foreground text-xs">
                              Sin coincidencias en el catálogo
                            </p>
                          )}
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
                          title="Descartar esta línea"
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
