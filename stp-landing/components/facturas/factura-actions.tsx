'use client'

import { useState } from 'react'
import { ImageIcon, MoreHorizontal, Pencil, ShieldCheck, Trash2 } from 'lucide-react'
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
import { deleteFiscalInvoice, validateFiscalInvoiceWithDgii } from '@/lib/actions/fiscal-invoices'
import { isEcf, type DgiiComprobante, type FiscalInvoice } from '@/lib/fiscal-invoices'
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
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Eliminar factura</DialogTitle>
          <DialogDescription>
            ¿Eliminar la factura <span className="font-mono font-semibold text-foreground">{invoice.ncf}</span> de{' '}
            {invoice.supplierName}? Sale del 606{invoice.expenseId ? ' y también se elimina su gasto' : ''}. Esta acción no se puede deshacer.
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

      <DeleteDialog invoice={invoice} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  )
}
