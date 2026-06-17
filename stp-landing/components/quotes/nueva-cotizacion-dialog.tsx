'use client'

import { useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2, FolderPlus } from 'lucide-react'
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
import type { Client, Project } from '@/lib/types'
import { createQuote } from '@/lib/actions/quotes'

// ── Section / Item types (local state, not persisted to form) ─────────────────

type ItemRow = {
  id: string
  description: string
  unit: string
  quantity: string
  unitPrice: string
  discountPct: string
}

type Section = {
  id: string
  name: string
  items: ItemRow[]
}

function genId() {
  return Math.random().toString(36).slice(2, 9)
}
function makeItem(): ItemRow {
  return { id: genId(), description: '', unit: '', quantity: '1', unitPrice: '', discountPct: '' }
}
function makeSection(label: string): Section {
  return { id: genId(), name: label, items: [makeItem()] }
}

// ── Header schema (sections/items managed separately with useState) ───────────

const headerSchema = z.object({
  title: z.string().min(2, 'Mínimo 2 caracteres').max(200),
  clientId: z.string().min(1, 'Selecciona un cliente'),
  projectId: z.string().optional(),
  status: z.enum(['draft', 'sent', 'approved', 'rejected', 'expired']),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
})
type HeaderValues = z.infer<typeof headerSchema>

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS = {
  draft: 'Borrador',
  sent: 'Enviada',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  expired: 'Expirada',
}

const UNITS = [
  { value: 'unid',     label: 'Unid.' },
  { value: 'm',        label: 'm (Metro)' },
  { value: 'm2',       label: 'm² (M. cuadrado)' },
  { value: 'm3',       label: 'm³ (M. cúbico)' },
  { value: 'kg',       label: 'kg (Kilogramo)' },
  { value: 'lb',       label: 'lb (Libra)' },
  { value: 'hr',       label: 'hr (Hora)' },
  { value: 'dia',      label: 'día' },
  { value: 'pie',      label: 'pie' },
  { value: 'pulg',     label: 'pulg. (Pulgada)' },
  { value: 'gl',       label: 'gl (Galón)' },
  { value: 'lt',       label: 'lt (Litro)' },
  { value: 'rollo',    label: 'rollo' },
  { value: 'caja',     label: 'caja' },
  { value: 'juego',    label: 'juego' },
  { value: 'servicio', label: 'servicio' },
  { value: 'otro',     label: 'otro' },
]

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })
const ITBIS_RATE = 0.18

// ── Component ─────────────────────────────────────────────────────────────────

export function NuevaCotizacionDialog({
  clients,
  projects,
}: {
  clients: Client[]
  projects: Project[]
}) {
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [itemsError, setItemsError] = useState<string | null>(null)
  const [applyITBIS, setApplyITBIS] = useState(true)
  const [sections, setSections] = useState<Section[]>(() => [makeSection('Partida 1')])

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<HeaderValues>({
    resolver: zodResolver(headerSchema),
    defaultValues: { status: 'draft' },
  })

  const clientId = watch('clientId')
  const projectId = watch('projectId')
  const filteredProjects = projects.filter((p) => p.clientId === clientId)
  const selectedClient = clients.find((c) => c.id === clientId)
  const selectedProject = filteredProjects.find((p) => p.id === projectId)

  // ── Section mutations ─────────────────────────────────────────────────────

  const addSection = useCallback(() => {
    setSections((prev) => [...prev, makeSection(`Partida ${prev.length + 1}`)])
  }, [])

  const removeSection = useCallback((sectionId: string) => {
    setSections((prev) => prev.filter((s) => s.id !== sectionId))
  }, [])

  const renameSection = useCallback((sectionId: string, name: string) => {
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, name } : s)))
  }, [])

  const addItem = useCallback((sectionId: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, items: [...s.items, makeItem()] } : s)),
    )
  }, [])

  const removeItem = useCallback((sectionId: string, itemId: string) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s
        if (s.items.length <= 1) return s
        return { ...s, items: s.items.filter((i) => i.id !== itemId) }
      }),
    )
  }, [])

  const updateItem = useCallback(
    (sectionId: string, itemId: string, field: keyof Omit<ItemRow, 'id'>, value: string) => {
      setSections((prev) =>
        prev.map((s) => {
          if (s.id !== sectionId) return s
          return { ...s, items: s.items.map((i) => (i.id === itemId ? { ...i, [field]: value } : i)) }
        }),
      )
    },
    [],
  )

  // ── Computed totals ───────────────────────────────────────────────────────

  const allItems = sections.flatMap((s) => s.items)
  const subtotal = allItems.reduce((sum, item) => {
    const qty = parseFloat(item.quantity) || 0
    const price = parseFloat(item.unitPrice) || 0
    const disc = parseFloat(item.discountPct || '0') || 0
    return sum + qty * price * (1 - disc / 100)
  }, 0)
  const itbis = applyITBIS ? subtotal * ITBIS_RATE : 0
  const total = subtotal + itbis

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleClose() {
    setOpen(false)
    setSections([makeSection('Partida 1')])
    reset()
    setServerError(null)
    setItemsError(null)
    setApplyITBIS(true)
  }

  async function onSubmit(headerData: HeaderValues) {
    setItemsError(null)
    setServerError(null)

    const allRows = sections.flatMap((s) => s.items)
    if (allRows.length === 0) {
      setItemsError('Agrega al menos un ítem')
      return
    }
    for (const section of sections) {
      for (const item of section.items) {
        if (!item.description.trim()) {
          setItemsError('Todos los ítems necesitan descripción')
          return
        }
        if (!item.quantity || parseFloat(item.quantity) <= 0) {
          setItemsError('Cantidad debe ser mayor a 0')
          return
        }
        if (item.unitPrice === '' || parseFloat(item.unitPrice) < 0) {
          setItemsError('Precio unitario inválido')
          return
        }
      }
    }

    const flatItems = sections.flatMap((section, si) =>
      section.items.map((item, ii) => ({
        description: item.description,
        unit: item.unit || undefined,
        quantity: parseFloat(item.quantity),
        unitPrice: parseFloat(item.unitPrice),
        discountPct: parseFloat(item.discountPct || '0') || 0,
        sectionName: section.name || `Partida ${si + 1}`,
        sortOrder: si * 1000 + ii,
      })),
    )

    const result = await createQuote({
      title: headerData.title,
      clientId: headerData.clientId,
      projectId: headerData.projectId || undefined,
      status: headerData.status,
      validUntil: headerData.validUntil || undefined,
      notes: headerData.notes || undefined,
      taxRate: applyITBIS ? 18 : 0,
      items: flatItems,
    })

    if (!result.ok) {
      setServerError(result.error ?? 'Error desconocido')
      return
    }
    handleClose()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose()
        else setOpen(true)
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4 mr-1" />
        Nueva cotización
      </DialogTrigger>

      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva cotización</DialogTitle>
          <DialogDescription>
            El número se genera automáticamente (COT-YYYY-NNN).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 py-2">
          {/* Header fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-full space-y-1.5">
              <Label htmlFor="title">
                Título <span className="text-destructive">*</span>
              </Label>
              <Input id="title" placeholder="Propuesta de instalación eléctrica" {...register('title')} />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>
                Cliente <span className="text-destructive">*</span>
              </Label>
              <Select value={clientId ?? ''} onValueChange={(v) => { setValue('clientId', v ?? ''); setValue('projectId', undefined) }}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar cliente">{selectedClient?.name}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.clientId && <p className="text-xs text-destructive">{errors.clientId.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Proyecto (opcional)</Label>
              <Select
                value={projectId ?? '__none__'}
                onValueChange={(v) => setValue('projectId', !v || v === '__none__' ? undefined : v)}
                disabled={!clientId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin proyecto">
                    {selectedProject ? `${selectedProject.code} — ${selectedProject.name}` : 'Sin proyecto'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sin proyecto —</SelectItem>
                  {filteredProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select
                value={watch('status')}
                onValueChange={(v) => v && setValue('status', v as HeaderValues['status'])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="validUntil">Válida hasta</Label>
              <Input id="validUntil" type="date" {...register('validUntil')} />
            </div>

            <div className="col-span-full space-y-1.5">
              <Label htmlFor="notes">Notas</Label>
              <Input id="notes" placeholder="Condiciones, garantía..." {...register('notes')} />
            </div>
          </div>

          {/* Partidas / Sections */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Partidas e ítems <span className="text-destructive">*</span></Label>
            </div>

            {sections.map((section, si) => (
              <SectionBlock
                key={section.id}
                section={section}
                sectionIndex={si}
                applyITBIS={applyITBIS}
                canDelete={sections.length > 1}
                onRename={renameSection}
                onAddItem={addItem}
                onRemoveSection={removeSection}
                onRemoveItem={removeItem}
                onUpdateItem={updateItem}
              />
            ))}

            <Button type="button" variant="outline" size="sm" className="w-full" onClick={addSection}>
              <FolderPlus className="size-4 mr-1.5" />
              Agregar partida
            </Button>
          </div>

          {itemsError && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">{itemsError}</p>
          )}

          {/* ITBIS toggle + Totals */}
          <div className="flex items-end justify-between">
            <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
              <input
                type="checkbox"
                checked={applyITBIS}
                onChange={(e) => setApplyITBIS(e.target.checked)}
                className="rounded border-input"
              />
              Aplicar ITBIS (18%)
            </label>

            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{DOP.format(subtotal)}</span>
              </div>
              {applyITBIS && (
                <div className="flex justify-between text-muted-foreground">
                  <span>ITBIS (18%)</span>
                  <span className="tabular-nums">{DOP.format(itbis)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t pt-1">
                <span>Total</span>
                <span className="tabular-nums">{DOP.format(total)}</span>
              </div>
            </div>
          </div>

          {serverError && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">{serverError}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Crear cotización'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Shared SectionBlock ───────────────────────────────────────────────────────

function SectionBlock({
  section,
  sectionIndex,
  applyITBIS,
  canDelete,
  onRename,
  onAddItem,
  onRemoveSection,
  onRemoveItem,
  onUpdateItem,
}: {
  section: Section
  sectionIndex: number
  applyITBIS: boolean
  canDelete: boolean
  onRename: (id: string, name: string) => void
  onAddItem: (id: string) => void
  onRemoveSection: (id: string) => void
  onRemoveItem: (sectionId: string, itemId: string) => void
  onUpdateItem: (sectionId: string, itemId: string, field: keyof Omit<ItemRow, 'id'>, value: string) => void
}) {
  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Section header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/60 border-b">
        <span className="text-xs font-medium text-muted-foreground shrink-0">Partida</span>
        <Input
          value={section.name}
          onChange={(e) => onRename(section.id, e.target.value)}
          className="h-7 text-sm font-semibold border-0 shadow-none focus-visible:ring-0 px-1 bg-transparent flex-1"
          placeholder={`Partida ${sectionIndex + 1}`}
        />
        <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => onAddItem(section.id)}>
          <Plus className="size-3.5 mr-1" />
          Ítem
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onRemoveSection(section.id)}
          disabled={!canDelete}
          className="text-destructive hover:text-destructive shrink-0"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {/* Items table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[780px]">
          <thead className="bg-muted/30">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Descripción</th>
              <th className="px-2 py-2 text-left font-medium text-muted-foreground w-28">Unidad</th>
              <th className="px-2 py-2 text-right font-medium text-muted-foreground w-16">Cant.</th>
              <th className="px-2 py-2 text-right font-medium text-muted-foreground w-28">Precio unit.</th>
              <th className="px-2 py-2 text-right font-medium text-muted-foreground w-16">Desc.%</th>
              <th className="px-2 py-2 text-right font-medium text-muted-foreground w-28">Total</th>
              {applyITBIS && (
                <th className="px-2 py-2 text-right font-medium text-muted-foreground w-28">ITBIS</th>
              )}
              <th className="w-9" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {section.items.map((item) => {
              const qty = parseFloat(item.quantity) || 0
              const price = parseFloat(item.unitPrice) || 0
              const disc = parseFloat(item.discountPct || '0') || 0
              const rowTotal = qty * price * (1 - disc / 100)
              const rowItbis = applyITBIS ? rowTotal * ITBIS_RATE : 0

              return (
                <tr key={item.id}>
                  <td className="px-3 py-1.5">
                    <Input
                      value={item.description}
                      onChange={(e) => onUpdateItem(section.id, item.id, 'description', e.target.value)}
                      className="h-8 border-0 shadow-none focus-visible:ring-0 px-0 text-sm"
                      placeholder="Descripción del ítem"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Select
                      value={item.unit || '__none__'}
                      onValueChange={(v) => onUpdateItem(section.id, item.id, 'unit', !v || v === '__none__' ? '' : v)}
                    >
                      <SelectTrigger className="h-8 text-xs border-0 shadow-none focus:ring-0 px-0">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {UNITS.map((u) => (
                          <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number" min="0.01" step="0.01"
                      value={item.quantity}
                      onChange={(e) => onUpdateItem(section.id, item.id, 'quantity', e.target.value)}
                      className="h-8 border-0 shadow-none focus-visible:ring-0 px-0 text-right text-sm"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number" min="0" step="0.01"
                      value={item.unitPrice}
                      onChange={(e) => onUpdateItem(section.id, item.id, 'unitPrice', e.target.value)}
                      className="h-8 border-0 shadow-none focus-visible:ring-0 px-0 text-right text-sm"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number" min="0" max="100" step="0.01"
                      value={item.discountPct}
                      onChange={(e) => onUpdateItem(section.id, item.id, 'discountPct', e.target.value)}
                      className="h-8 border-0 shadow-none focus-visible:ring-0 px-0 text-right text-sm"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{DOP.format(rowTotal)}</td>
                  {applyITBIS && (
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {DOP.format(rowItbis)}
                    </td>
                  )}
                  <td className="px-1 py-1.5">
                    <Button
                      type="button" variant="ghost" size="icon-sm"
                      onClick={() => onRemoveItem(section.id, item.id)}
                      disabled={section.items.length === 1}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
