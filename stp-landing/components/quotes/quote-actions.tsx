'use client'

import { useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MoreHorizontal, Pencil, Trash2, Plus, FileText, FolderPlus, Printer, Send, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Client, Project, Quote } from '@/lib/types'
import { updateQuote, deleteQuote, sendQuoteEmail } from '@/lib/actions/quotes'
import {
  IndirectCostsSection,
  defaultIndirectRows,
  rowsFromIndirect,
  computeIndirect,
  indirectToPayload,
  type IndirectRow,
  type IndirectCost,
} from '@/components/quotes/indirect-costs'

// ── Local types for section/item state ───────────────────────────────────────

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

function genId() { return Math.random().toString(36).slice(2, 9) }
function makeItem(): ItemRow {
  return { id: genId(), description: '', unit: '', quantity: '1', unitPrice: '', discountPct: '' }
}
function makeSection(label: string): Section {
  return { id: genId(), name: label, items: [makeItem()] }
}

function sectionsFromQuote(quote: Quote): Section[] {
  if (!quote.items?.length) return [makeSection('Partida 1')]
  const nameOrder: string[] = []
  const map = new Map<string, ItemRow[]>()
  for (const item of quote.items) {
    const key = item.sectionName ?? ''
    if (!map.has(key)) { map.set(key, []); nameOrder.push(key) }
    map.get(key)!.push({
      id: genId(),
      description: item.description,
      unit: item.unit ?? '',
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
      discountPct: item.discountPct ? String(item.discountPct) : '',
    })
  }
  return nameOrder.map((name, i) => ({
    id: genId(),
    name: name || `Partida ${i + 1}`,
    items: map.get(name)!,
  }))
}

// ── Constants ─────────────────────────────────────────────────────────────────

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

const STATUS_LABELS = {
  draft: 'Borrador',
  sent: 'Enviada',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  expired: 'Expirada',
}

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })
const ITBIS_RATE = 0.18

// ── Edit schema (header fields only) ─────────────────────────────────────────

const editSchema = z.object({
  title: z.string().min(2, 'Mínimo 2 caracteres').max(200),
  clientId: z.string().min(1, 'Selecciona un cliente'),
  projectId: z.string().optional(),
  status: z.enum(['draft', 'sent', 'approved', 'rejected', 'expired']),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
  terms: z.string().optional(),
})
type EditFormValues = z.infer<typeof editSchema>

// ── Edit dialog ───────────────────────────────────────────────────────────────

function EditDialog({
  cotizacion,
  clients,
  projects,
  open,
  onOpenChange,
}: {
  cotizacion: Quote
  clients: Client[]
  projects: Project[]
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const existingIndirect = (cotizacion as { indirectCosts?: IndirectCost[] | null }).indirectCosts
  const hasIndirect = Array.isArray(existingIndirect) && existingIndirect.length > 0

  const [serverError, setServerError] = useState<string | null>(null)
  const [itemsError, setItemsError] = useState<string | null>(null)
  const [applyITBIS, setApplyITBIS] = useState(cotizacion.taxRate !== 0)
  const [useIndirect, setUseIndirect] = useState(hasIndirect)
  const [indirectRows, setIndirectRows] = useState<IndirectRow[]>(() =>
    hasIndirect ? rowsFromIndirect(existingIndirect!) : defaultIndirectRows(),
  )
  const [sections, setSections] = useState<Section[]>(() => sectionsFromQuote(cotizacion))

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      title: cotizacion.title,
      clientId: cotizacion.clientId,
      projectId: cotizacion.projectId ?? undefined,
      status: cotizacion.status,
      validUntil: cotizacion.validUntil ? cotizacion.validUntil.slice(0, 10) : '',
      notes: cotizacion.notes ?? '',
      terms: cotizacion.terms ?? '',
    },
  })

  const clientId = watch('clientId')
  const projectId = watch('projectId')
  const filteredProjects = projects.filter((p) => p.clientId === clientId)
  const selectedClient = clients.find((c) => c.id === clientId)
  const selectedProject = filteredProjects.find((p) => p.id === projectId)

  // ── Section mutations ───────────────────────────────────────────────────

  const addSection = useCallback(() => {
    setSections((prev) => [...prev, makeSection(`Partida ${prev.length + 1}`)])
  }, [])
  const removeSection = useCallback((id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id))
  }, [])
  const renameSection = useCallback((id: string, name: string) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)))
  }, [])
  const addItem = useCallback((sectionId: string) => {
    setSections((prev) => prev.map((s) => s.id === sectionId ? { ...s, items: [...s.items, makeItem()] } : s))
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

  // ── Totals ──────────────────────────────────────────────────────────────

  const allItems = sections.flatMap((s) => s.items)
  const subtotal = allItems.reduce((sum, item) => {
    const qty = parseFloat(item.quantity) || 0
    const price = parseFloat(item.unitPrice) || 0
    const disc = parseFloat(item.discountPct || '0') || 0
    return sum + qty * price * (1 - disc / 100)
  }, 0)
  const indirectCalc = computeIndirect(subtotal, indirectRows)
  const itbis = useIndirect ? indirectCalc.itbis : applyITBIS ? subtotal * ITBIS_RATE : 0
  const total = useIndirect ? indirectCalc.total : subtotal + itbis

  function handleClose() {
    setServerError(null)
    setItemsError(null)
    onOpenChange(false)
  }

  async function onSubmit(data: EditFormValues) {
    setItemsError(null)
    setServerError(null)

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

    const result = await updateQuote(cotizacion.id, {
      title: data.title,
      clientId: data.clientId,
      projectId: data.projectId ?? null,
      status: data.status,
      validUntil: data.validUntil || null,
      notes: data.notes || null,
      terms: data.terms || null,
      taxRate: useIndirect ? 0 : applyITBIS ? 18 : 0,
      items: flatItems,
      indirectCosts: useIndirect ? indirectToPayload(indirectRows) : null,
    })
    if (!result.ok) {
      setServerError(result.error ?? 'Error desconocido')
      return
    }
    handleClose()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar cotización</DialogTitle>
          <DialogDescription>{cotizacion.number} — {cotizacion.title}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 py-2">
          {/* Header fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-full space-y-1.5">
              <Label htmlFor="edit-title">Título <span className="text-destructive">*</span></Label>
              <Input id="edit-title" {...register('title')} />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Cliente <span className="text-destructive">*</span></Label>
              <Select value={clientId ?? ''} onValueChange={(v) => { setValue('clientId', v ?? ''); setValue('projectId', undefined) }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar cliente">{selectedClient?.name}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
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
                <SelectTrigger className="w-full">
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
                onValueChange={(v) => v && setValue('status', v as EditFormValues['status'])}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-validUntil">Válida hasta</Label>
              <Input id="edit-validUntil" type="date" {...register('validUntil')} />
            </div>

            <div className="col-span-full space-y-1.5">
              <Label htmlFor="edit-notes">Notas</Label>
              <Input id="edit-notes" {...register('notes')} />
            </div>

            <div className="col-span-full space-y-1.5">
              <Label htmlFor="edit-terms">Términos y condiciones</Label>
              <textarea
                id="edit-terms"
                {...register('terms')}
                rows={4}
                className="w-full resize-y text-sm rounded-md border border-input bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Términos y condiciones aplicables a esta cotización..."
              />
            </div>
          </div>

          {/* Partidas / Sections */}
          <div className="space-y-3">
            <Label>Partidas e ítems</Label>
            {sections.map((section, si) => (
              <EditSectionBlock
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

          {/* Gastos indirectos */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium select-none">
              <input
                type="checkbox"
                checked={useIndirect}
                onChange={(e) => setUseIndirect(e.target.checked)}
                className="rounded border-input"
              />
              Aplicar gastos indirectos
            </label>

            {useIndirect ? (
              <IndirectCostsSection rows={indirectRows} setRows={setIndirectRows} base={subtotal} />
            ) : (
              <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
                <input
                  type="checkbox"
                  checked={applyITBIS}
                  onChange={(e) => setApplyITBIS(e.target.checked)}
                  className="rounded border-input"
                />
                Aplicar ITBIS (18%)
              </label>
            )}
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-72 space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>{useIndirect ? 'Subtotal costos directos' : 'Subtotal'}</span>
                <span className="tabular-nums">{DOP.format(subtotal)}</span>
              </div>
              {!useIndirect && applyITBIS && (
                <div className="flex justify-between text-muted-foreground">
                  <span>ITBIS (18%)</span>
                  <span className="tabular-nums">{DOP.format(itbis)}</span>
                </div>
              )}
              {useIndirect && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Total gastos indirectos</span>
                  <span className="tabular-nums">{DOP.format(total - subtotal)}</span>
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
              {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Reusable section block for edit dialog ────────────────────────────────────

function EditSectionBlock({
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
          type="button" variant="ghost" size="icon-sm"
          onClick={() => onRemoveSection(section.id)}
          disabled={!canDelete}
          className="text-destructive hover:text-destructive shrink-0"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

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
                        {UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
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

// ── Delete dialog ─────────────────────────────────────────────────────────────

function DeleteDialog({
  cotizacion,
  open,
  onOpenChange,
}: {
  cotizacion: Quote
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    setError(null)
    const result = await deleteQuote(cotizacion.id)
    setLoading(false)
    if (!result.ok) { setError(result.error ?? 'Error al eliminar'); return }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Eliminar cotización</DialogTitle>
          <DialogDescription>
            ¿Estás seguro de que deseas eliminar{' '}
            <span className="font-semibold text-foreground">{cotizacion.number}</span>? Esta acción
            no se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">{error}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Row actions ───────────────────────────────────────────────────────────────

export function QuoteActions({
  cotizacion,
  clients,
  projects,
  userRole,
}: {
  cotizacion: Quote
  clients: Client[]
  projects: Project[]
  userRole: string
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailResult, setEmailResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const isAdmin = userRole === 'ADMIN' || userRole === 'admin'
  const isLocked = !isAdmin && (cotizacion.status === 'approved' || cotizacion.status === 'rejected')
  const hasClientEmail = !!cotizacion.client?.email

  async function handleSendEmail() {
    setSendingEmail(true)
    setEmailResult(null)
    const result = await sendQuoteEmail(cotizacion.id)
    setSendingEmail(false)
    setEmailResult({ ok: result.ok, msg: result.ok ? 'Email enviado correctamente' : (result.error ?? 'Error al enviar') })
    if (result.ok) setTimeout(() => setEmailResult(null), 4000)
  }

  return (
    <>
      {emailResult && (
        <span className={`text-xs ${emailResult.ok ? 'text-green-600' : 'text-destructive'}`}>
          {emailResult.msg}
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
          <MoreHorizontal className="size-4" />
          <span className="sr-only">Acciones</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => { window.location.href = `/dashboard/cotizaciones/${cotizacion.id}` }}>
            <ExternalLink className="size-4" />
            Ver detalle
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => !isLocked && setEditOpen(true)} disabled={isLocked}>
            <Pencil className="size-4" />
            {isLocked ? 'Bloqueada' : 'Editar'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => window.open(`/api/files/quote/${cotizacion.id}?v=${Date.now()}`, '_blank')}
          >
            <FileText className="size-4" />
            Ver PDF
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              const win = window.open(`/api/files/quote/${cotizacion.id}?v=${Date.now()}`, '_blank')
              if (win) win.addEventListener('load', () => setTimeout(() => win.print(), 400))
            }}
          >
            <Printer className="size-4" />
            Imprimir
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleSendEmail}
            disabled={sendingEmail || !hasClientEmail}
          >
            <Send className="size-4" />
            {sendingEmail ? 'Enviando...' : 'Enviar por email'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-4" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {!isLocked && (
        <EditDialog
          cotizacion={cotizacion}
          clients={clients}
          projects={projects}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
      <DeleteDialog cotizacion={cotizacion} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  )
}
