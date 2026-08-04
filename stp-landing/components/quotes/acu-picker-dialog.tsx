'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Calculator, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import type { Acu } from '@/lib/types'
import type { EditorAcu } from '@/lib/quote-tree'
import { TRADE_LABELS, fmtDOP, fmtUnitCost } from '@/components/costos/acu-labels'

/**
 * Elige la partida de costos (ACU) de la que sale el unitario de una línea.
 *
 * El margen se pide aquí y no en el ACU: la misma partida se cotiza con margen distinto
 * según la obra, y guardarlo aparte del costo es lo que después permite comparar costo
 * contra costo sin mezclarlo con el margen.
 *
 * Un ACU incompleto (le falta el precio de algún material) se puede elegir, pero nunca en
 * silencio: se ve en rojo, dice cuántos precios faltan y hay que marcar una casilla. Su
 * costo es un piso, no el costo real, y mandarlo a un cliente como bueno es el error caro.
 */
export function AcuPickerDialog({
  open,
  onOpenChange,
  acus,
  /** Valor actual de la línea, si ya estaba enlazada. */
  current,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  acus: Acu[]
  current: EditorAcu | null
  onSelect: (acu: EditorAcu, unitPrice: number) => void
}) {
  const [query, setQuery] = useState('')
  const [acuId, setAcuId] = useState(current?.acuId ?? '')
  const [markupPct, setMarkupPct] = useState(current?.markupPct ?? '')
  const [aceptaIncompleto, setAceptaIncompleto] = useState(false)

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase()
    const activos = acus.filter((a) => a.isActive || a.id === acuId)
    if (!q) return activos.slice(0, 50)
    return activos
      .filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.code.toLowerCase().includes(q) ||
          (a.chapter ?? '').toLowerCase().includes(q),
      )
      .slice(0, 50)
  }, [acus, query, acuId])

  const seleccionado = acus.find((a) => a.id === acuId)
  const costo = seleccionado?.cost
  const directo = costo?.directCost ?? 0
  const incompleto = costo?.incomplete === true
  const sinCosto = !costo || directo <= 0

  const markupNum = Number.parseFloat(markupPct)
  const margen = Number.isFinite(markupNum) && markupNum > 0 ? markupNum : 0
  const unitario = Math.round(directo * (1 + margen / 100) * 100) / 100

  // No se puede enlazar lo que no se puede valorar: sin costo no hay unitario que
  // congelar, y el servidor lo rechazaría con un 422.
  const bloqueado = !acuId || sinCosto || (incompleto && !aceptaIncompleto)

  function confirmar() {
    if (!seleccionado || bloqueado) return
    onSelect(
      {
        acuId: seleccionado.id,
        acuCode: seleccionado.code,
        acuName: seleccionado.name,
        markupPct,
        // Enlace nuevo: el congelado lo pone el servidor con los costos de hoy.
        unitCost: null,
        pricedAt: null,
        incomplete: incompleto,
      },
      unitario,
    )
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="size-4" />
            Precio desde una partida de costos
          </DialogTitle>
          <DialogDescription>
            El unitario se calcula con los precios vigentes de los materiales y queda
            congelado en la cotización. Si esos precios cambian después, el sistema avisa;
            no se actualiza solo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="size-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, código o capítulo"
              className="pl-8"
            />
          </div>

          <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
            {filtrados.length === 0 && (
              <p className="text-sm text-muted-foreground px-3 py-6 text-center">
                {acus.length === 0
                  ? 'Todavía no hay partidas de costos. Créalas en Costos → Partidas (ACU).'
                  : 'Ninguna partida coincide con la búsqueda.'}
              </p>
            )}
            {filtrados.map((a) => {
              const c = a.cost
              const activo = a.id === acuId
              const faltan = c?.missingMaterialIds.length ?? 0
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setAcuId(a.id)
                    setAceptaIncompleto(false)
                  }}
                  className={`w-full text-left px-3 py-2 flex items-start justify-between gap-3 hover:bg-muted/60 ${
                    activo ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground">{a.code}</span>
                      <span className="text-sm font-medium">{a.name}</span>
                      <Badge className="bg-muted text-muted-foreground text-xs">
                        {TRADE_LABELS[a.trade]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      por {a.unit?.code ?? a.unit?.name ?? 'unidad'}
                      {a.chapter ? ` · ${a.chapter}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {c ? (
                      <span
                        className={`font-mono text-sm ${c.incomplete ? 'text-destructive' : ''}`}
                      >
                        {c.incomplete ? '≥ ' : ''}
                        {fmtUnitCost(c.directCost)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">sin costo</span>
                    )}
                    {faltan > 0 && (
                      <p className="text-xs text-destructive">
                        faltan {faltan} precio{faltan === 1 ? '' : 's'}
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {seleccionado && (
            <div className="rounded-md border p-3 space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-32">
                  <Label htmlFor="acu-markup" className="text-xs">
                    Margen %
                  </Label>
                  <Input
                    id="acu-markup"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1000"
                    value={markupPct}
                    onChange={(e) => setMarkupPct(e.target.value)}
                    placeholder="0"
                    className="h-8"
                  />
                </div>
                <div className="text-sm space-y-0.5">
                  <p className="text-muted-foreground text-xs">
                    Costo directo {incompleto ? '(mínimo)' : ''}:{' '}
                    <span className="font-mono">{fmtUnitCost(directo)}</span>
                  </p>
                  <p>
                    Precio unitario:{' '}
                    <span className="font-mono font-semibold">{fmtDOP(unitario)}</span>
                  </p>
                </div>
              </div>

              {sinCosto && (
                <p className="text-sm text-destructive flex items-start gap-2">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  Esta partida no tiene hoy un costo valorable: su receta está vacía o vale
                  0. Complétala antes de cotizarla.
                </p>
              )}

              {incompleto && !sinCosto && (
                <div className="rounded-md bg-destructive/10 p-2.5 space-y-2">
                  <p className="text-sm text-destructive flex items-start gap-2">
                    <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                    <span>
                      Le faltan {costo?.missingMaterialIds.length} precio(s) de material: el
                      costo mostrado es un <strong>mínimo</strong>, no el real. Lo que se
                      cotice saldrá corto.
                    </span>
                  </p>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={aceptaIncompleto}
                      onChange={(e) => setAceptaIncompleto(e.target.checked)}
                      className="size-4"
                    />
                    Usarlo así, sabiendo que el precio es un mínimo
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={confirmar} disabled={bloqueado}>
            Usar esta partida
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
