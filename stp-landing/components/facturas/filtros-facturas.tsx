'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  EXPENSE_TYPE_CODES,
  PAYMENT_METHOD_CODES,
  PAYMENT_METHODS_606,
  expenseTypeLabel,
} from '@/lib/fiscal-invoices'
import type { Project } from '@/lib/types'

const ALL = 'all'

const PROJECT_SCOPE: Record<string, string> = {
  with: 'Con proyecto',
  without: 'Sin proyecto (generales)',
}
const DGII: Record<string, string> = {
  pending: 'Sin validar',
  valid: 'Válidas (vigente/aceptado)',
  issue: 'Con observación',
}
const ASSIGNED: Record<string, string> = {
  assigned: 'Con gasto en el ERP',
  unassigned: 'Sin asignar',
}
const PHOTO: Record<string, string> = { yes: 'Con foto/PDF', no: 'Sin foto/PDF' }
/** Tipos de comprobante que acepta el 606. */
const NCF_TYPES: Record<string, string> = {
  B01: 'B01 · Crédito fiscal',
  B02: 'B02 · Consumo',
  B03: 'B03 · Nota de débito',
  B04: 'B04 · Nota de crédito',
  B11: 'B11 · Proveedor informal',
  B13: 'B13 · Gastos menores',
  B14: 'B14 · Regímenes especiales',
  B15: 'B15 · Gubernamental',
  B16: 'B16 · Exportaciones',
  B17: 'B17 · Pagos al exterior',
  E31: 'E31 · e-CF crédito fiscal',
  E32: 'E32 · e-CF consumo',
  E33: 'E33 · e-CF nota de débito',
  E34: 'E34 · e-CF nota de crédito',
  E41: 'E41 · e-CF compras',
  E43: 'E43 · e-CF gastos menores',
  E44: 'E44 · e-CF regímenes especiales',
  E45: 'E45 · e-CF gubernamental',
  E46: 'E46 · e-CF exportaciones',
  E47: 'E47 · e-CF pagos al exterior',
}

const KEYS = [
  'search', 'dateFrom', 'dateTo', 'expenseType', 'project', 'projectId', 'paymentMethod',
  'ncfType', 'dgii', 'assigned', 'hasPhoto', 'amountMin', 'amountMax',
]

function Filtro({
  value,
  onChange,
  allLabel,
  options,
  width = 'w-52',
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  allLabel: string
  options: [string, string][]
  width?: string
  placeholder: string
}) {
  const label = options.find(([k]) => k === value)?.[1]
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(!v || v === ALL ? '' : v)}>
      <SelectTrigger className={width}>
        <SelectValue placeholder={placeholder}>{label ?? allLabel}</SelectValue>
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

export function FiltrosFacturas({ projects = [] }: { projects?: Project[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const get = (k: string) => params.get(k) ?? ''
  const hasFilters = KEYS.some((k) => get(k))

  // Los campos que se teclean (búsqueda, montos) esperan a que se deje de escribir para no
  // recargar en cada tecla. Son no controlados; `resetKey` los vacía al pulsar "Limpiar".
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [resetKey, setResetKey] = useState(0)
  useEffect(() => {
    const t = timers.current
    return () => Object.values(t).forEach(clearTimeout)
  }, [])

  function push(mutate: (sp: URLSearchParams) => void) {
    const sp = new URLSearchParams(params.toString())
    mutate(sp)
    sp.delete('page')
    router.push(`${pathname}?${sp.toString()}`)
  }
  const put = (sp: URLSearchParams, key: string, value: string) => {
    if (value) sp.set(key, value)
    else sp.delete(key)
  }
  const set = (key: string, value: string) => push((sp) => put(sp, key, value))

  function typed(key: string, value: string) {
    clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(() => set(key, value.trim()), 400)
  }

  // Elegir un proyecto concreto reemplaza el "con/sin proyecto" (y al revés).
  const setScope = (v: string) => push((sp) => { sp.delete('projectId'); put(sp, 'project', v) })
  const setProject = (v: string) => push((sp) => { sp.delete('project'); put(sp, 'projectId', v) })

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Input
          key={`s${resetKey}`}
          defaultValue={get('search')}
          onChange={(e) => typed('search', e.target.value)}
          placeholder="Buscar NCF, RNC o emisor…"
          className="w-64"
        />
        <Input
          type="date" value={get('dateFrom')} onChange={(e) => set('dateFrom', e.target.value)}
          className="w-40" title="Desde"
        />
        <Input
          type="date" value={get('dateTo')} onChange={(e) => set('dateTo', e.target.value)}
          className="w-40" title="Hasta"
        />
        <Input
          key={`a${resetKey}`} type="number" min={0} inputMode="decimal" defaultValue={get('amountMin')}
          onChange={(e) => typed('amountMin', e.target.value)} placeholder="Monto desde" className="w-32"
        />
        <Input
          key={`b${resetKey}`} type="number" min={0} inputMode="decimal" defaultValue={get('amountMax')}
          onChange={(e) => typed('amountMax', e.target.value)} placeholder="Monto hasta" className="w-32"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Filtro
          value={get('project')} onChange={setScope} placeholder="Destino" allLabel="Con y sin proyecto"
          options={Object.entries(PROJECT_SCOPE)} width="w-56"
        />
        <Filtro
          value={get('projectId')} onChange={setProject} placeholder="Proyecto" allLabel="Todos los proyectos"
          options={projects.map((p): [string, string] => [p.id, `${p.code} · ${p.name}`])} width="w-64"
        />
        <Filtro
          value={get('assigned')} onChange={(v) => set('assigned', v)} placeholder="Asignación"
          allLabel="Asignadas y sin asignar" options={Object.entries(ASSIGNED)} width="w-56"
        />
        <Filtro
          value={get('expenseType')} onChange={(v) => set('expenseType', v)} placeholder="Tipo de gasto"
          allLabel="Todos los tipos de gasto" width="w-64"
          options={EXPENSE_TYPE_CODES.map((c): [string, string] => [c, expenseTypeLabel(c)])}
        />
        <Filtro
          value={get('paymentMethod')} onChange={(v) => set('paymentMethod', v)} placeholder="Forma de pago"
          allLabel="Todas las formas de pago" width="w-64"
          options={PAYMENT_METHOD_CODES.map((c): [string, string] => [c, `${c} · ${PAYMENT_METHODS_606[c]}`])}
        />
        <Filtro
          value={get('ncfType')} onChange={(v) => set('ncfType', v)} placeholder="Tipo de comprobante"
          allLabel="Todos los comprobantes" options={Object.entries(NCF_TYPES)} width="w-64"
        />
        <Filtro
          value={get('dgii')} onChange={(v) => set('dgii', v)} placeholder="DGII" allLabel="Cualquier estado DGII"
          options={Object.entries(DGII)} width="w-60"
        />
        <Filtro
          value={get('hasPhoto')} onChange={(v) => set('hasPhoto', v)} placeholder="Comprobante adjunto"
          allLabel="Con y sin foto" options={Object.entries(PHOTO)} width="w-48"
        />

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
