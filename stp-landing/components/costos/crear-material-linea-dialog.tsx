'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
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
import { createMaterialFromLine } from '@/lib/actions/price-imports'
import type { MaterialCategory, PriceImportLine, Unit } from '@/lib/types'
import { esErrorDeVersion, MENSAJE_VERSION } from '@/components/version-guard'

/** Siglas que se escriben en mayúscula ("Tubo PVC", no "Tubo Pvc"). */
const SIGLAS = new Set(['pvc', 'emt', 'thhn', 'thw', 'sdr', 'led', 'gfci', 'upvc', 'cpvc', 'ul', 'awg'])
/** Palabras cortas y unidades que van en minúscula dentro del nombre. */
const MINUSCULA = new Set(['de', 'del', 'la', 'el', 'con', 'para', 'por', 'y', 'o', 'en', 'x', 'a',
  'mm', 'cm', 'm', 'ml', 'lb', 'lbs', 'kg', 'gal', 'pies', 'pie', 'pulg'])

/** "ALAMBRE DE GOMA 6.0/4 MM" → "Alambre de goma 6.0/4 mm"; "TUBO PVC SDR-26" → "Tubo PVC SDR-26". */
export function nombreSugerido(raw: string): string {
  const palabras = raw.replace(/\s+/g, ' ').trim().toLowerCase().split(' ')
  return palabras
    .map((w, i) =>
      w
        .split('-')
        .map((parte, j) => {
          if (SIGLAS.has(parte)) return parte.toUpperCase()
          if (i > 0 && j === 0 && MINUSCULA.has(parte)) return parte
          return parte.charAt(0).toUpperCase() + parte.slice(1)
        })
        .join('-'),
    )
    .join(' ')
}

/** Unidad probable según lo que dice el renglón; la persona la confirma. */
export function unidadSugerida(line: PriceImportLine, units: Unit[]): string {
  const texto = `${line.rawUnit ?? ''} ${line.rawDescription}`.toLowerCase()
  const por = (code: string) => units.find((u) => u.code === code)?.id
  const reglas: [RegExp, string][] = [
    [/\(lb\)|\blibras?\b/, 'lb'],
    [/\b\d+\s*lbs?\b|\bsaco\b|\bfunda\b/, 'funda'],
    [/\brollo\b|\b\d+\s*pies\b/, 'rollo'],
    [/\bgal(o|ó)n\b|\bgl\b|\bcubeta\b/, 'gl'],
    [/\bcaja\b/, 'caja'],
    [/\bkg\b/, 'kg'],
    [/\bm2\b|\bmetro cuadrado\b/, 'm2'],
    [/\bmetros?\b|\bml\b/, 'm'],
  ]
  for (const [re, code] of reglas) {
    if (re.test(texto)) {
      const id = por(code)
      if (id) return id
    }
  }
  return por('ud') ?? units[0]?.id ?? ''
}

/**
 * Crea en el catálogo un material que el proveedor vende y el catálogo no
 * tiene, prellenado con lo que dice la cotización, y se lo asigna al renglón.
 */
export function CrearMaterialLineaDialog({
  importId,
  line,
  units,
  categories,
  onCreated,
}: {
  importId: string
  line: PriceImportLine
  units: Unit[]
  categories: MaterialCategory[]
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [unitId, setUnitId] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function abrir(o: boolean) {
    setOpen(o)
    if (o) {
      setName(nombreSugerido(line.rawDescription))
      setUnitId(unidadSugerida(line, units))
      setCategoryId(line.suggestedCategoryId ?? '')
      setError(null)
    }
  }

  async function crear() {
    if (name.trim().length < 2 || !unitId) {
      setError('Pon un nombre y una unidad')
      return
    }
    setSaving(true)
    setError(null)
    let r: { ok: boolean; error?: string }
    try {
      r = await createMaterialFromLine(importId, line.id, {
        name: name.trim(),
        unitId,
        ...(categoryId ? { categoryId } : {}),
      })
    } catch (err) {
      r = { ok: false, error: esErrorDeVersion(err) ? MENSAJE_VERSION : 'Error de conexión' }
    }
    setSaving(false)
    if (!r.ok) {
      setError(r.error ?? 'No se pudo crear')
      return
    }
    setOpen(false)
    onCreated()
  }

  return (
    <Dialog open={open} onOpenChange={abrir}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="h-7 gap-1 text-xs" />}>
        <Plus className="size-3.5" />
        Crear material nuevo
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo material en el catálogo</DialogTitle>
          <DialogDescription>
            Para lo que el proveedor vende y todavía no está en el catálogo. Queda asignado a este
            renglón y disponible para todas las cotizaciones y cálculos siguientes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted/50 rounded-md p-3 text-xs">
            <p className="text-muted-foreground">En la cotización dice:</p>
            <p className="mt-0.5 font-medium">{line.rawDescription}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nm-name">Nombre en el catálogo</Label>
            <Input id="nm-name" value={name} onChange={(e) => setName(e.target.value)} />
            <p className="text-muted-foreground text-xs">
              Corto y genérico (sin la marca si da igual cuál venga): así se reconoce en las
              próximas cotizaciones.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Unidad</Label>
              <Select value={unitId} onValueChange={(v) => v && setUnitId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Elegir" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Categoría (opcional)</Label>
              <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? '')}>
                <SelectTrigger>
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
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={crear} disabled={saving}>
            {saving ? 'Creando…' : 'Crear y asignar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
