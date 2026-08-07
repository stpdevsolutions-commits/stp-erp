'use client'

import { useState, useTransition } from 'react'
import { Plus, Save, Trash2, Check, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  guardarInforme,
  type AjustesInforme,
  type CasillasInforme,
  type ConceptoManual,
  type SeccionInforme,
  type TipoInforme,
} from '@/lib/actions/project-reports'

/**
 * Editor de la parte REDACTADA de un informe.
 *
 * Aquí solo se toca texto: título, introducción, observaciones, conclusiones,
 * secciones libres, conceptos añadidos a mano y las casillas de incluir o
 * excluir bloques. Las cifras (gastos, cobros, balance, % de presupuesto) NO se
 * editan en ningún sitio: salen de la base de datos cada vez que se imprime. Si
 * una cifra está mal, se corrige el gasto o el pago de origen — un informe cuyo
 * número se puede reescribir a mano deja de servir para decidir nada.
 */

const TEXTAREA =
  'w-full min-h-24 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm ' +
  'outline-none transition-colors placeholder:text-muted-foreground ' +
  'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

/** Casillas de cada tipo. Las del interno no existen en el de cliente. */
const CASILLAS: Record<TipoInforme, { key: keyof CasillasInforme; label: string; hint?: string }[]> = {
  interno: [
    { key: 'detalleGastos', label: 'Detalle de gastos', hint: 'Línea a línea, además del resumen por categoría' },
    { key: 'nomina', label: 'Desglose de nómina', hint: 'Ya incluida en la categoría "Mano de obra"' },
    { key: 'tareas', label: 'Tareas por estado' },
    { key: 'cronologia', label: 'Cobros recibidos' },
    { key: 'conceptosManuales', label: 'Conceptos añadidos a mano' },
  ],
  cliente: [
    { key: 'tareas', label: 'Actividades del proyecto' },
    { key: 'fichas', label: 'Fichas técnicas' },
    { key: 'fotos', label: 'Registro fotográfico' },
    { key: 'cronologia', label: 'Cronología de pagos recibidos' },
    { key: 'conceptosManuales', label: 'Conceptos añadidos a mano' },
  ],
}

const nuevoId = () => Math.random().toString(36).slice(2, 10)

export function InformeEditor({
  projectId,
  tipo,
  ajustes,
}: {
  projectId: string
  tipo: TipoInforme
  ajustes: AjustesInforme
}) {
  const [form, setForm] = useState<AjustesInforme>({
    ...ajustes,
    sections: ajustes.sections ?? [],
    manualItems: ajustes.manualItems ?? [],
  })
  const [guardando, startTransition] = useTransition()
  const [estado, setEstado] = useState<'idle' | 'ok' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof AjustesInforme>(key: K, value: AjustesInforme[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setEstado('idle')
  }

  const setCasilla = (key: keyof CasillasInforme, value: boolean) =>
    set('include', { ...form.include, [key]: value })

  const setSeccion = (i: number, patch: Partial<SeccionInforme>) =>
    set(
      'sections',
      form.sections.map((s, j) => (i === j ? { ...s, ...patch } : s)),
    )

  const setConcepto = (i: number, patch: Partial<ConceptoManual>) =>
    set(
      'manualItems',
      form.manualItems.map((m, j) => (i === j ? { ...m, ...patch } : m)),
    )

  function onGuardar() {
    setError(null)
    startTransition(async () => {
      const res = await guardarInforme(projectId, tipo, {
        title: form.title ?? '',
        intro: form.intro ?? '',
        observations: form.observations ?? '',
        conclusions: form.conclusions ?? '',
        // Se descartan las filas en blanco: una sección sin título ni cuerpo
        // solo ensucia el documento.
        sections: form.sections.filter((s) => s.title.trim() !== '' || s.body.trim() !== ''),
        manualItems: form.manualItems
          .filter((m) => m.description.trim() !== '')
          .map((m) => ({ ...m, amount: Number(m.amount) || 0 })),
        include: form.include,
      })
      if (!res.ok) {
        setEstado('error')
        setError(res.error ?? 'Error al guardar')
        return
      }
      setEstado('ok')
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contenido redactado</CardTitle>
          <p className="text-xs text-muted-foreground">
            Se guarda con el informe: al reimprimirlo no hay que volver a escribirlo.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="titulo">Título del informe</Label>
            <Input
              id="titulo"
              value={form.title ?? ''}
              onChange={(e) => set('title', e.target.value)}
              placeholder={tipo === 'interno' ? 'Informe interno' : 'Informe de proyecto'}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="intro">Introducción</Label>
            <textarea
              id="intro"
              className={TEXTAREA}
              value={form.intro ?? ''}
              onChange={(e) => set('intro', e.target.value)}
              placeholder="Contexto del trabajo realizado…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="observaciones">Observaciones</Label>
            <textarea
              id="observaciones"
              className={TEXTAREA}
              value={form.observations ?? ''}
              onChange={(e) => set('observations', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="conclusiones">Conclusiones y recomendaciones</Label>
            <textarea
              id="conclusiones"
              className={TEXTAREA}
              value={form.conclusions ?? ''}
              onChange={(e) => set('conclusions', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Secciones libres ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Secciones adicionales</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => set('sections', [...form.sections, { id: nuevoId(), title: '', body: '' }])}
          >
            <Plus className="size-4 mr-1.5" />
            Añadir sección
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {form.sections.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Sin secciones adicionales. Úsalas para alcance, metodología, garantías…
            </p>
          )}
          {form.sections.map((s, i) => (
            <div key={s.id ?? i} className="space-y-2 rounded-lg border border-input p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={s.title}
                  onChange={(e) => setSeccion(i, { title: e.target.value })}
                  placeholder="Título de la sección"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Eliminar sección"
                  onClick={() => set('sections', form.sections.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
              <textarea
                className={TEXTAREA}
                value={s.body}
                onChange={(e) => setSeccion(i, { body: e.target.value })}
                placeholder="Texto de la sección"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── Conceptos añadidos a mano ────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Conceptos añadidos a mano</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              set('manualItems', [
                ...form.manualItems,
                { id: nuevoId(), description: '', amount: 0, notes: '' },
              ])
            }
          >
            <Plus className="size-4 mr-1.5" />
            Añadir concepto
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-4 shrink-0" />
            <p>
              Estos importes NO salen de la base de datos. Van en el informe en su propia tabla,
              rotulados como añadidos a mano, y no se suman a las cifras calculadas.
            </p>
          </div>
          {form.manualItems.map((m, i) => (
            <div key={m.id ?? i} className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-48 space-y-1">
                <Label className="text-xs">Concepto</Label>
                <Input
                  value={m.description}
                  onChange={(e) => setConcepto(i, { description: e.target.value })}
                />
              </div>
              <div className="flex-1 min-w-40 space-y-1">
                <Label className="text-xs">Nota</Label>
                <Input
                  value={m.notes ?? ''}
                  onChange={(e) => setConcepto(i, { notes: e.target.value })}
                />
              </div>
              <div className="w-32 space-y-1">
                <Label className="text-xs">Monto (RD$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={String(m.amount ?? 0)}
                  onChange={(e) => setConcepto(i, { amount: Number(e.target.value) })}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Eliminar concepto"
                onClick={() => set('manualItems', form.manualItems.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── Bloques a incluir ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bloques a incluir</CardTitle>
          <p className="text-xs text-muted-foreground">
            Marca lo que debe aparecer en el documento que se imprime.
          </p>
        </CardHeader>
        <CardContent className="grid gap-2.5 sm:grid-cols-2">
          {CASILLAS[tipo].map(({ key, label, hint }) => (
            <label key={key} className="flex items-start gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={form.include?.[key] ?? false}
                onChange={(e) => setCasilla(key, e.target.checked)}
              />
              <span>
                {label}
                {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
              </span>
            </label>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={onGuardar} disabled={guardando}>
          <Save className="size-4 mr-1.5" />
          {guardando ? 'Guardando…' : 'Guardar informe'}
        </Button>
        {estado === 'ok' && (
          <span className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
            <Check className="size-4" />
            Guardado
          </span>
        )}
        {estado === 'error' && (
          <span className={cn('text-sm text-destructive')}>{error}</span>
        )}
      </div>
    </div>
  )
}
