'use client'

import { useState } from 'react'
import { PackagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createMaterialsFromLines } from '@/lib/actions/price-imports'
import type { MaterialCategory, PriceImportLine, Unit } from '@/lib/types'
import { nombreSugerido, unidadSugerida } from './crear-material-linea-dialog'
import { esErrorDeVersion, MENSAJE_VERSION } from '@/components/version-guard'

interface Fila {
  lineId: string
  raw: string
  precio: string
  name: string
  unitId: string
  categoryId: string
  marcada: boolean
  /** Tiene un material parecido en el catálogo: puede que NO haga falta crearlo. */
  parecido: string | null
}

/**
 * Crea de una vez, desde la cotización, los materiales que el catálogo no
 * tiene. Pensado para cotizaciones de un rubro nuevo (p. ej. drywall), donde
 * casi ningún renglón existe todavía y crearlos de uno en uno cansa.
 */
export function CrearMaterialesFaltantesDialog({
  importId,
  lines,
  units,
  categories,
  onDone,
}: {
  importId: string
  /** Renglones pendientes SIN material. */
  lines: PriceImportLine[]
  units: Unit[]
  categories: MaterialCategory[]
  onDone: (creados: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [filas, setFilas] = useState<Fila[]>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  function abrir(o: boolean) {
    setOpen(o)
    if (!o) return
    setMsg(null)
    setFilas(
      lines.map((l) => {
        const parecido = l.suggestions?.[0]?.name ?? null
        return {
          lineId: l.id,
          raw: l.rawDescription,
          precio: l.price.toLocaleString('es-DO', { minimumFractionDigits: 2 }),
          name: nombreSugerido(l.rawDescription),
          unitId: unidadSugerida(l, units),
          categoryId: l.suggestedCategoryId ?? '',
          // Si ya hay algo parecido en el catálogo, por defecto NO se crea: mejor
          // aceptar la sugerencia que duplicar el material.
          marcada: !parecido,
          parecido,
        }
      }),
    )
  }

  function cambiar(i: number, patch: Partial<Fila>) {
    setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  }

  const marcadas = filas.filter((f) => f.marcada)

  async function crear() {
    if (marcadas.some((f) => f.name.trim().length < 2 || !f.unitId)) {
      setMsg('Cada material marcado necesita nombre y unidad.')
      return
    }
    setSaving(true)
    setMsg(null)
    let r: Awaited<ReturnType<typeof createMaterialsFromLines>>
    try {
      r = await createMaterialsFromLines(
        importId,
        marcadas.map((f) => ({
          lineId: f.lineId,
          name: f.name.trim(),
          unitId: f.unitId,
          ...(f.categoryId ? { categoryId: f.categoryId } : {}),
        })),
      )
    } catch (err) {
      r = { ok: false, error: esErrorDeVersion(err) ? MENSAJE_VERSION : 'Error de conexión' }
    }
    setSaving(false)
    if (!r.ok) {
      setMsg(r.error ?? 'No se pudieron crear')
      return
    }
    const fallidos = new Set((r.skipped ?? []).map((s) => s.lineId))
    onDone(marcadas.filter((f) => !fallidos.has(f.lineId)).map((f) => f.lineId))
    if (r.skipped && r.skipped.length > 0) {
      // Se queda abierto con solo los que fallaron, para corregirlos ahí mismo.
      setFilas((prev) => prev.filter((f) => fallidos.has(f.lineId)))
      setMsg(
        `${r.created} creado(s). No se pudieron crear: ` +
          r.skipped.map((s) => `"${s.name}" (${s.reason})`).join('; '),
      )
    } else {
      setOpen(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={abrir}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <PackagePlus className="size-4" />
        Crear materiales faltantes ({lines.length})
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Crear en el catálogo lo que falta</DialogTitle>
          <DialogDescription>
            Cada renglón marcado se convierte en un material nuevo del catálogo y queda asignado,
            listo para aprobar su precio. Ajusta el nombre (corto y genérico) y la unidad. Los que
            tienen algo parecido en el catálogo vienen sin marcar: revisa si no es el mismo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Categoría</Label>
          <p className="text-muted-foreground text-xs">
            Cada renglón trae la categoría que detectó el sistema (por el material parecido del
            catálogo o por palabras como &quot;tornillo&quot;, &quot;plancha&quot;, &quot;breaker&quot;).
            Corrígela en el renglón, o cámbiala para todos los marcados a la vez:
          </p>
          <Select
            value=""
            onValueChange={(v) => v && setFilas((prev) => prev.map((f) => (f.marcada ? { ...f, categoryId: v } : f)))}
          >
            <SelectTrigger className="sm:w-72">
              <SelectValue placeholder="Poner a todos los marcados…" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="divide-y rounded-md border">
          {filas.map((f, i) => (
            <div key={f.lineId} className="flex gap-3 p-3">
              <input
                type="checkbox"
                className="accent-primary mt-2 size-4"
                checked={f.marcada}
                onChange={(e) => cambiar(i, { marcada: e.target.checked })}
                aria-label={`Crear ${f.raw}`}
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-muted-foreground truncate text-xs">
                  {f.raw} · RD$ {f.precio}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={f.name}
                    onChange={(e) => cambiar(i, { name: e.target.value })}
                    disabled={!f.marcada}
                    className="h-8 text-sm"
                  />
                  <Select value={f.unitId} onValueChange={(v) => v && cambiar(i, { unitId: v })} disabled={!f.marcada}>
                    <SelectTrigger className="h-8 sm:w-36">
                      <SelectValue placeholder="Unidad" />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={f.categoryId}
                    onValueChange={(v) => cambiar(i, { categoryId: v ?? '' })}
                    disabled={!f.marcada}
                  >
                    <SelectTrigger className="h-8 sm:w-48">
                      <SelectValue placeholder="Sin categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {f.parecido && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    En el catálogo ya hay algo parecido: {f.parecido}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {msg && <p className="text-sm">{msg}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={crear} disabled={saving || marcadas.length === 0}>
            {saving ? 'Creando…' : `Crear ${marcadas.length} material(es)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
