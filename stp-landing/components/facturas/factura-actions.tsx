'use client'

import { toast } from '@/lib/toast'
import { useEffect, useState } from 'react'
import { ImageIcon, Link2, Link2Off, MoreHorizontal, Pencil, ShieldCheck, Split, Trash2 } from 'lucide-react'
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
import { FacturaForm } from '@/components/facturas/factura-form'
import { DividirFacturaDialog } from '@/components/facturas/dividir-factura-dialog'
import { GastoCandidatos } from '@/components/facturas/gasto-candidatos'
import {
  deleteFiscalInvoice,
  findInvoiceExpenseCandidates,
  linkFiscalInvoiceToExpense,
  unlinkFiscalInvoiceExpense,
  validateFiscalInvoiceWithDgii,
} from '@/lib/actions/fiscal-invoices'
import { isEcf, type DgiiComprobante, type ExpenseCandidate, type FiscalInvoice } from '@/lib/fiscal-invoices'
import type { Project } from '@/lib/types'

const VERDICT_STYLE: Record<DgiiComprobante['verdict'], string> = {
  valid: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-red-50 text-red-800 border-red-200',
  'not-found': 'bg-red-50 text-red-800 border-red-200',
  'needs-data': 'bg-amber-50 text-amber-800 border-amber-200',
  unknown: 'bg-amber-50 text-amber-800 border-amber-200',
}

/** Consulta la factura en el portal de la DGII y deja el resultado guardado en ella. */
function ValidateDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: FiscalInvoice
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [code, setCode] = useState(invoice.securityCode ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DgiiComprobante | null>(null)
  const ecf = isEcf(invoice.ncf)

  async function consult() {
    setLoading(true)
    setError(null)
    const res = await validateFiscalInvoiceWithDgii(invoice.id, ecf && code.trim() ? code.trim() : undefined)
    setLoading(false)
    if (!res.ok || !res.result) {
      setError(res.error ?? 'No se pudo consultar la DGII')
      return
    }
    setResult(res.result)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Validar en la DGII</DialogTitle>
          <DialogDescription>
            Consulta <span className="font-mono">{invoice.ncf}</span> de {invoice.supplierName} en el portal de la DGII
            {invoice.dgiiEstado ? ` (último resultado: ${invoice.dgiiEstado})` : ''}.
          </DialogDescription>
        </DialogHeader>

        {ecf && (
          <div className="space-y-1.5">
            <Label htmlFor="v-code">Código de seguridad del e-CF</Label>
            <Input
              id="v-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Sale en el QR del comprobante"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Un e-CF solo se confirma con este código (y el RNC de la empresa, que ya se usa solo).
            </p>
          </div>
        )}

        {error && <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">{error}</p>}
        {result && (
          <div className={`rounded-md border px-3 py-2 text-sm ${VERDICT_STYLE[result.verdict]}`}>
            <p className="font-medium">{result.estado ?? 'Sin resultado'}</p>
            <p>{result.message}</p>
            {result.emisor && <p className="text-xs mt-1">Emisor en la DGII: {result.emisor}</p>}
            {result.vigencia && <p className="text-xs">Válido hasta: {result.vigencia}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cerrar</Button>
          <Button onClick={consult} disabled={loading}>
            {loading ? 'Consultando…' : result ? 'Consultar de nuevo' : 'Consultar ahora'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: FiscalInvoice
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    setError(null)
    const result = await deleteFiscalInvoice(invoice.id)
    setLoading(false)
    if (!result.ok) {
      setError(result.error ?? 'Error al eliminar')
      return
    }
    toast.success('Factura eliminada')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Eliminar factura</DialogTitle>
          <DialogDescription>
            ¿Eliminar la factura <span className="font-mono font-semibold text-foreground">{invoice.ncf}</span> de{' '}
            {invoice.supplierName}? Sale del 606
            {invoice.splits?.length
              ? ' y también se eliminan los gastos de cada parte del reparto'
              : invoice.expenseId
                ? invoice.expenseOwned === false
                  ? '. El gasto al que estaba vinculada se conserva'
                  : ' y también se elimina su gasto'
                : ''}
            . Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">{error}</p>}
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

/** Busca entre los gastos ya registrados a mano el que corresponde a esta factura y los vincula (ERP-50). */
function VincularDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: FiscalInvoice
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [candidates, setCandidates] = useState<ExpenseCandidate[] | null>(null)
  const [value, setValue] = useState<string | null>(null)
  const [sync, setSync] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void findInvoiceExpenseCandidates(invoice.id).then((res) => {
      if (cancelled) return
      if (!res.ok) setError(res.error ?? 'No se pudieron buscar los gastos')
      else {
        const found = res.data ?? []
        setCandidates(found)
        // Si hay una coincidencia clara y única, ya viene marcada.
        if (found.length === 1 && found[0].level === 'strong') setValue(found[0].expenseId)
      }
    })
    return () => {
      cancelled = true
    }
  }, [invoice.id])

  async function link() {
    if (!value) return
    setLoading(true)
    setError(null)
    const res = await linkFiscalInvoiceToExpense(invoice.id, value, sync)
    setLoading(false)
    if (!res.ok) {
      setError(res.error ?? 'No se pudo vincular')
      return
    }
    toast.success('Factura vinculada al gasto')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Vincular a un gasto ya registrado</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{invoice.ncf}</span> · {invoice.supplierName}. Si ya habías anotado esta compra en
            Gastos, vincúlala para no duplicarla.
          </DialogDescription>
        </DialogHeader>

        {candidates === null && !error && <p className="text-sm text-muted-foreground">Buscando gastos parecidos…</p>}
        {candidates !== null && candidates.length === 0 && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            No hay gastos sin factura que se parezcan (mismo proveedor, monto y fecha cercana). Revisa en Gastos, o dale un
            destino a la factura desde Editar para crear su gasto.
          </p>
        )}
        {candidates !== null && candidates.length > 0 && (
          <GastoCandidatos
            candidates={candidates}
            value={value}
            onChange={setValue}
            sync={sync}
            onSyncChange={setSync}
            name={`vincular-${invoice.id}`}
          />
        )}
        {error && <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cerrar</Button>
          <Button onClick={link} disabled={loading || !value}>
            {loading ? 'Vinculando…' : 'Vincular al gasto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UnlinkDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: FiscalInvoice
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function unlink() {
    setLoading(true)
    setError(null)
    const res = await unlinkFiscalInvoiceExpense(invoice.id)
    setLoading(false)
    if (!res.ok) {
      setError(res.error ?? 'No se pudo desvincular')
      return
    }
    toast.success('Factura desvinculada del gasto')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Desvincular del gasto</DialogTitle>
          <DialogDescription>
            La factura <span className="font-mono font-semibold text-foreground">{invoice.ncf}</span> deja de estar
            vinculada a su gasto. El gasto no se borra: queda en Gastos, sin factura.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={unlink} disabled={loading}>{loading ? 'Desvinculando…' : 'Desvincular'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function FacturaActions({
  invoice,
  userRole,
  projects,
}: {
  invoice: FiscalInvoice
  userRole: string
  projects: Project[]
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [validateOpen, setValidateOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [unlinkOpen, setUnlinkOpen] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)

  // Editar: admin y finanza (módulo 'facturas' = manage). Eliminar: solo admin.
  const isAdmin = userRole.toLowerCase() === 'admin'

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
          <MoreHorizontal className="size-4" />
          <span className="sr-only">Acciones</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setValidateOpen(true)}>
            <ShieldCheck className="size-4" />
            Validar en la DGII
          </DropdownMenuItem>
          {/* Una factura vinculada a un gasto que ya existía no se divide: primero se desvincula. */}
          {!(invoice.expenseId && invoice.expenseOwned === false) && (
            <DropdownMenuItem onClick={() => setSplitOpen(true)}>
              <Split className="size-4" />
              Dividir factura…
            </DropdownMenuItem>
          )}
          {!invoice.expenseId && !invoice.splits?.length && (
            <DropdownMenuItem onClick={() => setLinkOpen(true)}>
              <Link2 className="size-4" />
              Vincular a un gasto…
            </DropdownMenuItem>
          )}
          {invoice.expenseId && invoice.expenseOwned === false && (
            <DropdownMenuItem onClick={() => setUnlinkOpen(true)}>
              <Link2Off className="size-4" />
              Desvincular del gasto
            </DropdownMenuItem>
          )}
          {invoice.photoPath && (
            <DropdownMenuItem
              onClick={() => window.open(`/api/files/fiscal-invoice/${invoice.id}?v=${Date.now()}`, '_blank')}
            >
              <ImageIcon className="size-4" />
              Ver comprobante
            </DropdownMenuItem>
          )}
          {isAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="size-4" />
                Eliminar
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar factura</DialogTitle>
            <DialogDescription>
              <span className="font-mono">{invoice.ncf}</span> · {invoice.supplierName}
            </DialogDescription>
          </DialogHeader>
          {editOpen && <FacturaForm invoice={invoice} projects={projects} onDone={() => setEditOpen(false)} />}
        </DialogContent>
      </Dialog>

      {/* Se monta solo abierto: así el código y el resultado nacen limpios cada vez. */}
      {validateOpen && <ValidateDialog invoice={invoice} open={validateOpen} onOpenChange={setValidateOpen} />}

      {/* Se montan solo abiertos: la búsqueda de gastos nace limpia cada vez. */}
      {linkOpen && <VincularDialog invoice={invoice} open={linkOpen} onOpenChange={setLinkOpen} />}
      {unlinkOpen && <UnlinkDialog invoice={invoice} open={unlinkOpen} onOpenChange={setUnlinkOpen} />}

      {/* Se monta solo abierto: las líneas nacen del reparto guardado cada vez. */}
      {splitOpen && (
        <DividirFacturaDialog invoice={invoice} projects={projects} open={splitOpen} onOpenChange={setSplitOpen} />
      )}

      <DeleteDialog invoice={invoice} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  )
}
