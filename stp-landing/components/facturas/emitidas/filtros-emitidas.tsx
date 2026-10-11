'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Client, Project } from '@/lib/types'

const ALL = 'all'
const STATUS: Record<string, string> = { draft: 'Borrador', issued: 'Emitida' }
const PAYMENT: Record<string, string> = {
  unpaid: 'Sin cobrar',
  partial: 'Cobro parcial',
  paid: 'Cobrada',
  overdue: 'Vencida con saldo',
  void: 'Anulada (nota de crédito)',
}
const KIND: Record<string, string> = { invoice: 'Solo facturas', credit_note: 'Solo notas de crédito' }
const ECF: Record<string, string> = {
  accepted: 'Aceptado por la DGII',
  transmitted: 'Transmitido (esperando respuesta)',
  signed: 'Firmado, sin transmitir',
  rejected: 'Rechazado por la DGII',
}
const KEYS = ['search', 'clientId', 'projectId', 'status', 'payment', 'ecfEstado', 'kind', 'dateFrom', 'dateTo']

function Filtro({
  value,
  onChange,
  allLabel,
  options,
  width,
}: {
  value: string
  onChange: (v: string) => void
  allLabel: string
  options: [string, string][]
  width: string
}) {
  const label = options.find(([k]) => k === value)?.[1]
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(!v || v === ALL ? '' : v)}>
      <SelectTrigger className={width}>
        <SelectValue>{label ?? allLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map(([k, l]) => (
          <SelectItem key={k} value={k}>{l}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function FiltrosEmitidas({ clients, projects }: { clients: Client[]; projects: Project[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const get = (k: string) => params.get(k) ?? ''
  const hasFilters = KEYS.some((k) => get(k))

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [resetKey, setResetKey] = useState(0)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  function set(key: string, value: string) {
    const sp = new URLSearchParams(params.toString())
    if (value) sp.set(key, value)
    else sp.delete(key)
    sp.delete('page')
    router.push(`${pathname}?${sp.toString()}`)
  }

  const clientProjects = get('clientId') ? projects.filter((p) => p.clientId === get('clientId')) : projects

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Input
          key={resetKey}
          defaultValue={get('search')}
          onChange={(e) => {
            if (timer.current) clearTimeout(timer.current)
            const v = e.target.value.trim()
            timer.current = setTimeout(() => set('search', v), 350)
          }}
          placeholder="Buscar número, e-NCF o cliente…"
          className="w-72"
        />
        <Input type="date" value={get('dateFrom')} onChange={(e) => set('dateFrom', e.target.value)} className="w-40" title="Desde" />
        <Input type="date" value={get('dateTo')} onChange={(e) => set('dateTo', e.target.value)} className="w-40" title="Hasta" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Filtro
          value={get('clientId')} onChange={(v) => set('clientId', v)} allLabel="Todos los clientes" width="w-64"
          options={clients.map((c): [string, string] => [c.id, c.name])}
        />
        <Filtro
          value={get('projectId')} onChange={(v) => set('projectId', v)} allLabel="Todos los proyectos" width="w-64"
          options={clientProjects.map((p): [string, string] => [p.id, `${p.code} · ${p.name}`])}
        />
        <Filtro value={get('kind')} onChange={(v) => set('kind', v)} allLabel="Facturas y notas de crédito" width="w-60" options={Object.entries(KIND)} />
        <Filtro value={get('status')} onChange={(v) => set('status', v)} allLabel="Borradores y emitidas" width="w-52" options={Object.entries(STATUS)} />
        <Filtro value={get('payment')} onChange={(v) => set('payment', v)} allLabel="Cualquier estado de cobro" width="w-60" options={Object.entries(PAYMENT)} />
        <Filtro value={get('ecfEstado')} onChange={(v) => set('ecfEstado', v)} allLabel="Cualquier estado del e-CF" width="w-60" options={Object.entries(ECF)} />
        {hasFilters && (
          <Button
            variant="ghost" size="sm" className="gap-1"
            onClick={() => {
              setResetKey((k) => k + 1)
              router.push(pathname)
            }}
          >
            <X className="size-4" />
            Limpiar
          </Button>
        )}
      </div>
    </div>
  )
}
