'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { FacturaActions } from '@/components/facturas/factura-actions'
import { assignFiscalInvoices } from '@/lib/actions/fiscal-invoices'
import { expenseTypeLabel, type FiscalInvoice } from '@/lib/fiscal-invoices'
import { GENERAL_EXPENSE } from '@/lib/general-expense'
import type { Project } from '@/lib/types'
import { formatDate } from '@/lib/utils'

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

/** 1-30-99187-3 / 001-1234567-8: más legible que los dígitos sueltos. */
function formatRnc(rnc: string): string {
  if (rnc.length === 9) return `${rnc[0]}-${rnc.slice(1, 3)}-${rnc.slice(3, 8)}-${rnc[8]}`
  if (rnc.length === 11) return `${rnc.slice(0, 3)}-${rnc.slice(3, 10)}-${rnc[10]}`
  return rnc
}

function DgiiBadge({ estado }: { estado: string | null }) {
  if (!estado) return <span className="text-muted-foreground text-xs">Sin validar</span>
  const ok = ['aceptado', 'vigente'].includes(estado.toLowerCase())
  const bad = ['rechazado', 'no encontrado', 'vencido', 'anulado'].includes(estado.toLowerCase())
  return (
    <Badge variant={bad ? 'destructive' : ok ? 'default' : 'outline'} className={ok ? 'bg-emerald-600 hover:bg-emerald-600' : ''}>
      {estado}
    </Badge>
  )
}

/** Dónde cae el gasto de la factura: un proyecto, general, o todavía no tiene gasto. */
function Destino({ f }: { f: FiscalInvoice }) {
  if (f.expense?.project) {
    return (
      <div>
        <div className="text-sm">{f.expense.project.name}</div>
        <div className="text-xs text-muted-foreground font-mono">{f.expense.project.code}</div>
      </div>
    )
  }
  if (f.expenseId) return <Badge variant="secondary">General</Badge>
  return (
    <Badge variant="outline" className="text-amber-700 border-amber-300">
      Sin asignar
    </Badge>
  )
}

export function FacturasTabla({
  facturas,
  projects,
  userRole,
  hayFiltros,
}: {
  facturas: FiscalInvoice[]
  projects: Project[]
  userRole: string
  hayFiltros: boolean
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [destino, setDestino] = useState<string>('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const allSelected = facturas.length > 0 && facturas.every((f) => selected.has(f.id))

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(facturas.map((f) => f.id)))
  }

  const destinoLabel =
    destino === GENERAL_EXPENSE
      ? 'Gasto general (sin proyecto)'
      : projects.find((p) => p.id === destino)
        ? `${projects.find((p) => p.id === destino)!.code} — ${projects.find((p) => p.id === destino)!.name}`
        : undefined

  function assign() {
    if (!destino || selected.size === 0) return
    setMessage(null)
    startTransition(async () => {
      const res = await assignFiscalInvoices([...selected], destino === GENERAL_EXPENSE ? null : destino)
      if (!res.ok) {
        setMessage({ ok: false, text: res.error ?? 'No se pudo asignar' })
        return
      }
      const fallidas = res.failed?.length ?? 0
      setMessage({
        ok: fallidas === 0,
        text:
          fallidas === 0
            ? `${res.updated} factura(s) asignada(s).`
            : `${res.updated} asignada(s); ${fallidas} fallaron: ${res.failed?.map((f) => f.error).join('; ')}`,
      })
      setSelected(new Set())
    })
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">{selected.size} seleccionada(s)</span>
          <Select value={destino} onValueChange={(v) => v && setDestino(v)}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Asignar a…">{destinoLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={GENERAL_EXPENSE}>Gasto general (sin proyecto)</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={assign} disabled={!destino || pending}>
            {pending ? 'Asignando…' : 'Asignar'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={pending}>
            Quitar selección
          </Button>
        </div>
      )}
      {message && (
        <p className={`text-sm rounded-md px-3 py-2 ${message.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-destructive/10 text-destructive'}`}>
          {message.text}
        </p>
      )}

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  aria-label="Seleccionar todas las facturas de esta página"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="size-4 accent-[var(--primary)]"
                />
              </TableHead>
              <TableHead>NCF</TableHead>
              <TableHead>Emisor</TableHead>
              <TableHead className="hidden lg:table-cell">Tipo de gasto</TableHead>
              <TableHead className="hidden md:table-cell">Proyecto</TableHead>
              <TableHead className="hidden lg:table-cell">DGII</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="hidden md:table-cell">Fecha</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {facturas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  {hayFiltros ? 'No hay facturas que coincidan con los filtros' : 'Todavía no hay facturas registradas'}
                </TableCell>
              </TableRow>
            ) : (
              facturas.map((f) => (
                <TableRow key={f.id} data-state={selected.has(f.id) ? 'selected' : undefined}>
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar la factura ${f.ncf}`}
                      checked={selected.has(f.id)}
                      onChange={() => toggle(f.id)}
                      className="size-4 accent-[var(--primary)]"
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {f.ncf}
                    <span className="block text-muted-foreground md:hidden font-sans">{formatDate(f.invoiceDate)}</span>
                  </TableCell>
                  <TableCell className="whitespace-normal min-w-[160px]">
                    <div className="text-sm font-medium">{f.supplierName}</div>
                    <div className="text-xs text-muted-foreground font-mono">{formatRnc(f.supplierRnc)}</div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">{expenseTypeLabel(f.expenseType)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Destino f={f} />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <DgiiBadge estado={f.dgiiEstado} />
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{DOP.format(f.totalAmount)}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{formatDate(f.invoiceDate)}</TableCell>
                  <TableCell>
                    <FacturaActions invoice={f} userRole={userRole} projects={projects} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
