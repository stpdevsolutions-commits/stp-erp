'use client'

import { useState } from 'react'
import { Calculator, Check, ClipboardList, RotateCcw, TrendingDown, TrendingUp } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type CalcMode = 'forward' | 'backward' | 'direct'
export type TaxKey = 'baseAmount' | 'itbis' | 'isc' | 'tip' | 'otherTax'
export type TaxAmounts = Record<TaxKey, number>

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const num = (s: string) => (s && !isNaN(parseFloat(s)) ? parseFloat(s) : 0)

const MODES: { key: CalcMode; label: string; hint: string; icon: typeof Calculator }[] = [
  { key: 'forward', label: 'Desde base', hint: 'Tienes el subtotal: se le suman los impuestos.', icon: TrendingUp },
  { key: 'backward', label: 'Desde total', hint: 'Tienes el total: se desglosan los impuestos incluidos.', icon: TrendingDown },
  { key: 'direct', label: 'Transcribir', hint: 'Copia los montos tal como vienen impresos en la factura.', icon: ClipboardList },
]

const TAXES = [
  { key: 'itbis', label: 'ITBIS', rate: 0.18 },
  { key: 'isc', label: 'ISC', rate: 0.16 },
  { key: 'tip', label: 'Propina', rate: 0.1 },
] as const
type TaxToggle = (typeof TAXES)[number]['key']

/**
 * Calculadora fiscal para digitar una factura (traída de FiscoRD). Tiene tres métodos:
 * partir de la base, partir del total o transcribir los montos impresos. Solo escribe en los
 * campos del formulario (`onChange`); los campos de abajo siguen siendo editables a mano.
 */
export function CalculadoraFiscal({
  values,
  onChange,
  scan,
}: {
  values: TaxAmounts
  onChange: (key: TaxKey, value: number) => void
  /** Lectura de un QR: la calculadora pasa a "Transcribir" con el total y el ITBIS leídos. */
  scan?: { total: number; itbis: number } | null
}) {
  const [mode, setMode] = useState<CalcMode>('backward')
  const [active, setActive] = useState<Record<TaxToggle, boolean>>({ itbis: false, isc: false, tip: false })
  const [baseInput, setBaseInput] = useState('')
  const [totalInput, setTotalInput] = useState('')
  // Transcribir
  const [dTotal, setDTotal] = useState('')
  const [dItbis18, setDItbis18] = useState('')
  const [dItbis16, setDItbis16] = useState('')
  const [itbisManual, setItbisManual] = useState(false)

  // Un QR trae los montos tal cual están impresos: se muestran en "Transcribir".
  const [lastScan, setLastScan] = useState<typeof scan>(undefined)
  if (scan !== lastScan) {
    setLastScan(scan)
    if (scan) {
      setMode('direct')
      setDTotal(scan.total > 0 ? String(scan.total) : '')
      setDItbis18('')
      setDItbis16('')
      setItbisManual(scan.itbis > 0)
    }
  }

  const rate = (a: Record<TaxToggle, boolean>) => TAXES.reduce((s, t) => s + (a[t.key] ? t.rate : 0), 0)

  function pushForward(base: number, a: Record<TaxToggle, boolean>) {
    onChange('baseAmount', base)
    for (const t of TAXES) onChange(t.key, a[t.key] ? r2(base * t.rate) : 0)
  }

  function pushBackward(total: number, a: Record<TaxToggle, boolean>) {
    const base = r2(total / (1 + rate(a)))
    onChange('baseAmount', base)
    for (const t of TAXES) onChange(t.key, a[t.key] ? r2(base * t.rate) : 0)
  }

  function toggle(key: TaxToggle) {
    const next = { ...active, [key]: !active[key] }
    setActive(next)
    if (mode === 'forward') pushForward(num(baseInput), next)
    else if (num(totalInput) > 0) pushBackward(num(totalInput), next)
  }

  function clearAll() {
    onChange('baseAmount', 0)
    onChange('itbis', 0)
    onChange('isc', 0)
    onChange('tip', 0)
    onChange('otherTax', 0)
  }

  function switchMode(next: CalcMode) {
    if (next === mode) return
    setMode(next)
    setActive({ itbis: false, isc: false, tip: false })
    setBaseInput('')
    setTotalInput('')
    setDTotal('')
    setDItbis18('')
    setDItbis16('')
    setItbisManual(false)
    clearAll()
  }

  // Transcribir: la base sale de restar al total lo que la factura ya trae desglosado.
  const pushDirect = (total: number, itbis: number, tip: number, other: number) =>
    onChange('baseAmount', r2(Math.max(0, total - itbis - tip - other)))

  function directTotal(v: string) {
    setDTotal(v)
    pushDirect(num(v), values.itbis, values.tip, values.otherTax)
  }
  function directItbisParts(v18: string, v16: string) {
    setDItbis18(v18)
    setDItbis16(v16)
    if (itbisManual) return
    const combined = r2(num(v18) + num(v16))
    onChange('itbis', combined)
    pushDirect(num(dTotal), combined, values.tip, values.otherTax)
  }
  function directItbisTotal(v: number) {
    setItbisManual(true)
    onChange('itbis', v)
    pushDirect(num(dTotal), v, values.tip, values.otherTax)
  }
  function directItbisReset() {
    setItbisManual(false)
    const combined = r2(num(dItbis18) + num(dItbis16))
    onChange('itbis', combined)
    pushDirect(num(dTotal), combined, values.tip, values.otherTax)
  }

  const combinedPct = Math.round(rate(active) * 100)
  const anyActive = TAXES.some((t) => active[t.key])
  const modeInfo = MODES.find((m) => m.key === mode)!
  const field =
    'h-10 text-right font-mono tabular-nums max-md:h-11'

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3 sm:col-span-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Calculator className="size-4 text-primary" />
        Calculadora fiscal
      </div>

      <div role="tablist" aria-label="Método de cálculo" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {MODES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => switchMode(key)}
            className={cn(
              'flex min-h-9 items-center justify-center gap-1 rounded-md px-1.5 text-xs font-semibold transition-colors max-md:min-h-11',
              mode === key ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3.5 shrink-0" />
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{modeInfo.hint}</p>

      {mode !== 'direct' && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="calc-monto" className="text-sm font-medium">
              {mode === 'forward' ? 'Monto base (subtotal)' : 'Monto total de la factura'}
            </label>
            <Input
              id="calc-monto"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              className={field}
              value={mode === 'forward' ? baseInput : totalInput}
              onChange={(e) => {
                const v = e.target.value
                if (mode === 'forward') {
                  setBaseInput(v)
                  pushForward(num(v), active)
                } else {
                  setTotalInput(v)
                  if (num(v) > 0) pushBackward(num(v), active)
                  else clearAll()
                }
              }}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {TAXES.map(({ key, label, rate: r }) => {
              const on = active[key]
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(key)}
                  className={cn(
                    'flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg border-2 p-2 text-center transition-colors',
                    on
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:border-primary/60',
                  )}
                >
                  <span className="flex items-center gap-1 text-xs font-semibold">
                    {on && <Check className="size-3" strokeWidth={3} />}
                    {label}
                  </span>
                  <span className={cn('text-[11px]', on ? 'opacity-80' : 'text-muted-foreground')}>
                    {Math.round(r * 100)}%
                  </span>
                </button>
              )
            })}
          </div>

          {anyActive && (mode === 'forward' ? num(baseInput) > 0 : num(totalInput) > 0) && (
            <div className="flex items-center justify-between rounded-md bg-background px-3 py-2 text-xs">
              <span>
                Tasa combinada: <strong>{combinedPct}%</strong>
              </span>
              {mode === 'forward' ? (
                <span>
                  Total: <strong className="font-mono">{DOP.format(r2(values.baseAmount + values.itbis + values.isc + values.tip + values.otherTax))}</strong>
                </span>
              ) : (
                <span>
                  Base: <strong className="font-mono">{DOP.format(values.baseAmount)}</strong>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {mode === 'direct' && (
        <div className="divide-y divide-dashed overflow-hidden rounded-lg border bg-background">
          <Row label={<span className="font-semibold">Total facturado</span>} highlight>
            <Input
              aria-label="Total facturado"
              type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
              className={cn(field, 'font-bold')}
              value={dTotal}
              onChange={(e) => directTotal(e.target.value)}
            />
          </Row>
          <Row label="ITBIS 18%">
            <Input
              aria-label="ITBIS 18%"
              type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
              className={field}
              value={dItbis18}
              onChange={(e) => directItbisParts(e.target.value, dItbis16)}
            />
          </Row>
          <Row label="ITBIS 16%">
            <Input
              aria-label="ITBIS 16%"
              type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
              className={field}
              value={dItbis16}
              onChange={(e) => directItbisParts(dItbis18, e.target.value)}
            />
          </Row>
          <Row
            label={
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold">Total ITBIS</span>
                {!itbisManual && (num(dItbis18) > 0 || num(dItbis16) > 0) && (
                  <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">auto</span>
                )}
                {itbisManual && (
                  <button type="button" onClick={directItbisReset} className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline">
                    <RotateCcw className="size-3" /> restaurar
                  </button>
                )}
              </span>
            }
          >
            <Input
              aria-label="Total ITBIS"
              type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
              className={cn(field, 'font-bold')}
              value={values.itbis || ''}
              onChange={(e) => directItbisTotal(num(e.target.value))}
            />
          </Row>
          <Row label="Propina">
            <Input
              aria-label="Propina"
              type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
              className={field}
              value={values.tip || ''}
              onChange={(e) => {
                const v = num(e.target.value)
                onChange('tip', v)
                pushDirect(num(dTotal), values.itbis, v, values.otherTax)
              }}
            />
          </Row>
          <Row label="Otros impuestos">
            <Input
              aria-label="Otros impuestos"
              type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
              className={field}
              value={values.otherTax || ''}
              onChange={(e) => {
                const v = num(e.target.value)
                onChange('otherTax', v)
                pushDirect(num(dTotal), values.itbis, values.tip, v)
              }}
            />
          </Row>
          {values.baseAmount > 0 && (
            <div className="flex items-center justify-between bg-muted/40 px-3 py-2.5 text-sm">
              <span className="font-semibold">Monto base (derivado)</span>
              <span className="font-mono font-bold tabular-nums">{DOP.format(values.baseAmount)}</span>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">El resultado llena los campos de abajo, que puedes seguir ajustando a mano.</p>
    </div>
  )
}

function Row({ label, children, highlight }: { label: React.ReactNode; children: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 px-3 py-2', highlight && 'bg-primary/5')}>
      <div className="min-w-0 flex-1 text-sm text-muted-foreground">{label}</div>
      <div className="w-36 shrink-0">{children}</div>
    </div>
  )
}
