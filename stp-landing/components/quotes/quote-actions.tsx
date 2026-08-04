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
import type { Acu, Client, Project, Quote } from '@/lib/types'
import { updateQuote, deleteQuote, sendQuoteEmail } from '@/lib/actions/quotes'
import { PartidasEditor } from '@/components/quotes/partidas-editor'
import {
  type EditorNode,
  editorTreeFromQuote,
  toPayload,
  treeSubtotal,
  validateTree,
} from '@/lib/quote-tree'
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
  acus,
  open,
  onOpenChange,
}: {
  cotizacion: Quote
  clients: Client[]
  projects: Project[]
  acus: Acu[]
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
  const [nodes, setNodes] = useState<EditorNode[]>(() => editorTreeFromQuote(cotizacion))

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

  // ── Totals ──────────────────────────────────────────────────────────────

  const subtotal = treeSubtotal(nodes)
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

    const problem = validateTree(nodes)
    if (problem) {
      setItemsError(problem)
      return
    }

    const result = await updateQuote(cotizacion.id, {
      title: data.title,
      clientId: data.clientId,
      projectId: data.projectId ?? null,
      status: data.status,
      validUntil: data.validUntil || null,
      notes: data.notes || null,
      terms: data.terms || null,
      taxRate: useIndirect ? 0 : applyITBIS ? 18 : 0,
      items: toPayload(nodes),
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

          <PartidasEditor nodes={nodes} onChange={setNodes} acus={acus} />

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
  acus = [],
}: {
  cotizacion: Quote
  clients: Client[]
  projects: Project[]
  userRole: string
  /** Partidas de costos, para calcular unitarios desde una receta. */
  acus?: Acu[]
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailResult, setEmailResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const isAdmin = userRole === 'ADMIN' || userRole === 'admin'
  const isSuperseded = !!cotizacion.supersededById
  // Una reemplazada es documento histórico: bloqueada para todos (incl. ADMIN).
  const isLocked =
    isSuperseded || (!isAdmin && (cotizacion.status === 'approved' || cotizacion.status === 'rejected'))
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
            disabled={sendingEmail || !hasClientEmail || isSuperseded}
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
          acus={acus}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
      <DeleteDialog cotizacion={cotizacion} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  )
}
