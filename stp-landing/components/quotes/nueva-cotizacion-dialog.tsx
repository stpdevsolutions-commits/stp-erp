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
import { PartidasEditor } from '@/components/quotes/partidas-editor'
import {
  type EditorNode,
  makeGroup,
  toPayload,
  treeSubtotal,
  validateTree,
} from '@/lib/quote-tree'
import {
  IndirectCostsSection,
  defaultIndirectRows,
  computeIndirect,
  indirectToPayload,
  type IndirectRow,
} from '@/components/quotes/indirect-costs'


// ── Header schema (sections/items managed separately with useState) ───────────

const headerSchema = z.object({
  title: z.string().min(2, 'Mínimo 2 caracteres').max(200),
  clientId: z.string().min(1, 'Selecciona un cliente'),
  projectId: z.string().optional(),
  status: z.enum(['draft', 'sent', 'approved', 'rejected', 'expired']),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
  terms: z.string().optional(),
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
  defaultTerms = '',
}: {
  clients: Client[]
  projects: Project[]
  defaultTerms?: string
}) {
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [itemsError, setItemsError] = useState<string | null>(null)
  const [applyITBIS, setApplyITBIS] = useState(true)
  const [useIndirect, setUseIndirect] = useState(true)
  const [indirectRows, setIndirectRows] = useState<IndirectRow[]>(() => defaultIndirectRows())
  const [nodes, setNodes] = useState<EditorNode[]>(() => [makeGroup('Partida 1')])

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<HeaderValues>({
    resolver: zodResolver(headerSchema),
    defaultValues: { status: 'draft', terms: defaultTerms },
  })

  const clientId = watch('clientId')
  const projectId = watch('projectId')
  const filteredProjects = projects.filter((p) => p.clientId === clientId)
  const selectedClient = clients.find((c) => c.id === clientId)
  const selectedProject = filteredProjects.find((p) => p.id === projectId)

  // ── Computed totals ───────────────────────────────────────────────────────

  const subtotal = treeSubtotal(nodes)
  const indirectCalc = computeIndirect(subtotal, indirectRows)
  const itbis = useIndirect ? indirectCalc.itbis : applyITBIS ? subtotal * ITBIS_RATE : 0
  const total = useIndirect ? indirectCalc.total : subtotal + itbis

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleClose() {
    setOpen(false)
    setNodes([makeGroup('Partida 1')])
    reset({ status: 'draft', terms: defaultTerms })
    setServerError(null)
    setItemsError(null)
    setApplyITBIS(true)
    setUseIndirect(true)
    setIndirectRows(defaultIndirectRows())
  }

  async function onSubmit(headerData: HeaderValues) {
    setItemsError(null)
    setServerError(null)

    const problem = validateTree(nodes)
    if (problem) {
      setItemsError(problem)
      return
    }

    const result = await createQuote({
      title: headerData.title,
      clientId: headerData.clientId,
      projectId: headerData.projectId || undefined,
      status: headerData.status,
      validUntil: headerData.validUntil || undefined,
      notes: headerData.notes || undefined,
      terms: headerData.terms || undefined,
      taxRate: useIndirect ? 0 : applyITBIS ? 18 : 0,
      items: toPayload(nodes),
      ...(useIndirect ? { indirectCosts: indirectToPayload(indirectRows) } : {}),
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
                <SelectTrigger className="w-full">
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
                onValueChange={(v) => v && setValue('status', v as HeaderValues['status'])}
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
              <Label htmlFor="validUntil">Válida hasta</Label>
              <Input id="validUntil" type="date" {...register('validUntil')} />
            </div>

            <div className="col-span-full space-y-1.5">
              <Label htmlFor="notes">Notas</Label>
              <Input id="notes" placeholder="Condiciones especiales, garantía..." {...register('notes')} />
            </div>

            <div className="col-span-full space-y-1.5">
              <Label htmlFor="terms">Términos y condiciones</Label>
              <textarea
                id="terms"
                rows={3}
                placeholder="Términos de pago, validez, condiciones..."
                className="w-full resize-y text-sm rounded-md border border-input bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
                {...register('terms')}
              />
            </div>
          </div>

          <PartidasEditor nodes={nodes} onChange={setNodes} />

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
              {isSubmitting ? 'Guardando...' : 'Crear cotización'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

