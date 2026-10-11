'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, QrCode } from 'lucide-react'
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
import { QrReader } from '@/components/facturas/qr-reader'
import { GastoCandidatos } from '@/components/facturas/gasto-candidatos'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  EXPENSE_TYPE_CODES,
  NCF_REGEX,
  PAYMENT_METHOD_CODES,
  PAYMENT_METHODS_606,
  expenseTypeLabel,
  isEcf,
  type ExpenseCandidate,
  type ScanResult,
  normalizeNcf,
  normalizeRnc,
  type FiscalInvoice,
} from '@/lib/fiscal-invoices'
import {
  createFiscalInvoice,
  findExpenseCandidates,
  linkFiscalInvoiceToExpense,
  lookupRncInDgii,
  scanFiscalInvoice,
  scanQrText,
  suggestForSupplier,
  updateFiscalInvoice,
  uploadFiscalInvoicePhoto,
  validateFiscalInvoiceWithDgii,
} from '@/lib/actions/fiscal-invoices'
import { todayRD } from '@/lib/utils'
import { GENERAL_EXPENSE } from '@/lib/general-expense'
import type { Project } from '@/lib/types'

/** Valor del selector cuando la factura todavía no tiene gasto (cuenta solo para el 606). */
const PENDING = '__pending__'

const money = z
  .string()
  .optional()
  .refine((v) => !v || (!isNaN(parseFloat(v)) && parseFloat(v) >= 0), 'Debe ser un monto ≥ 0')

const schema = z.object({
  ncf: z
    .string()
    .min(1, 'Requerido')
    .refine((v) => NCF_REGEX.test(normalizeNcf(v)), 'NCF no válido: B + tipo + 8 dígitos, o E + tipo + 10 dígitos'),
  supplierRnc: z
    .string()
    .min(1, 'Requerido')
    .refine((v) => /^(\d{9}|\d{11})$/.test(normalizeRnc(v)), 'El RNC debe tener 9 dígitos (11 si es cédula)'),
  supplierName: z.string().min(2, 'Mínimo 2 caracteres'),
  invoiceDate: z.string().min(1, 'Requerido'),
  baseAmount: z
    .string()
    .min(1, 'Requerido')
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, 'Debe ser un monto ≥ 0'),
  itbis: money,
  isc: money,
  tip: money,
  otherTax: money,
  paymentMethod: z.string().min(1),
  expenseType: z.string().min(1, 'Elige el tipo de gasto'),
  notes: z.string().optional(),
  securityCode: z
    .string()
    .optional()
    .refine((v) => !v || /^[A-Za-z0-9]{4,16}$/.test(v), 'Entre 4 y 16 letras o números'),
  /** Gasto general, un proyecto (uuid) o sin gasto todavía. */
  destino: z.string().min(1),
})

type FormValues = z.infer<typeof schema>

const num = (v?: string) => (v && !isNaN(parseFloat(v)) ? parseFloat(v) : 0)
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

function defaultsFor(invoice?: FiscalInvoice, prefill?: ScanResult): FormValues {
  if (!invoice) {
    // Con una lectura previa (pantalla móvil de escaneo) el formulario nace ya relleno.
    const f = prefill?.fields
    const n = (v?: number) => (v ? String(v) : '')
    return {
      ncf: f?.ncf ?? '',
      supplierRnc: f?.supplierRnc ?? '',
      supplierName: f?.supplierName ?? '',
      invoiceDate: f?.invoiceDate ?? todayRD(),
      baseAmount: n(f?.baseAmount),
      itbis: n(f?.itbis),
      isc: n(f?.isc),
      tip: n(f?.tip),
      otherTax: n(f?.otherTax),
      paymentMethod: f?.paymentMethod ?? '01',
      expenseType: f?.expenseType ?? '',
      notes: f?.notes ?? '',
      securityCode: f?.securityCode ?? '',
      destino: GENERAL_EXPENSE,
    }
  }
  const n = (v: number) => (v ? String(v) : '')
  return {
    ncf: invoice.ncf,
    supplierRnc: invoice.supplierRnc,
    supplierName: invoice.supplierName,
    invoiceDate: invoice.invoiceDate.slice(0, 10),
    baseAmount: String(invoice.baseAmount),
    itbis: n(invoice.itbis),
    isc: n(invoice.isc),
    tip: n(invoice.tip),
    otherTax: n(invoice.otherTax),
    paymentMethod: invoice.paymentMethod,
    expenseType: invoice.expenseType,
    notes: invoice.notes ?? '',
    securityCode: invoice.securityCode ?? '',
    destino: invoice.expenseId ? (invoice.expense?.projectId ?? GENERAL_EXPENSE) : PENDING,
  }
}

/** Lo que la pantalla de escaneo muestra al guardar. */
export interface SavedSummary {
  ncf: string
  supplierName: string
  total: number
  destino: string
}

/**
 * Formulario de alta y de edición de una factura fiscal. `onDone(saved)` cierra el diálogo
 * (`saved` es false si se canceló). `prefill`/`prefillFile`: una lectura ya hecha (la pantalla
 * móvil escanea primero) con su foto, que se adjunta al guardar.
 */
export function FacturaForm({
  invoice,
  projects,
  prefill,
  prefillFile,
  onDone,
  onSaved,
}: {
  invoice?: FiscalInvoice
  projects: Project[]
  prefill?: ScanResult
  prefillFile?: File
  onDone: (saved: boolean) => void
  onSaved?: (summary: SavedSummary) => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [photo, setPhoto] = useState<File | null>(prefillFile ?? null)
  // Id de la factura si ya se guardó en un intento anterior y solo falló la foto.
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [rncHint, setRncHint] = useState<{ ok: boolean; text: string } | null>(null)
  const [searchingRnc, setSearchingRnc] = useState(false)
  const scanInput = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [scanInfo, setScanInfo] = useState<ScanResult | null>(prefill ?? null)
  const [qrOpen, setQrOpen] = useState(false)
  const [historyHint, setHistoryHint] = useState<string | null>(null)
  // Gastos ya registrados a mano que se parecen a esta factura (ERP-50) y el que se eligió vincular.
  const [candidates, setCandidates] = useState<ExpenseCandidate[]>([])
  const [linkId, setLinkId] = useState<string | null>(null)
  const [syncExpense, setSyncExpense] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    getValues,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaultsFor(invoice, prefill) })

  const total = r2(
    num(watch('baseAmount')) + num(watch('itbis')) + num(watch('isc')) + num(watch('tip')) + num(watch('otherTax')),
  )
  const expenseType = watch('expenseType')
  const paymentMethod = watch('paymentMethod')
  const ncfValue = watch('ncf') ?? ''
  const destino = watch('destino')
  const supplierRncW = watch('supplierRnc') ?? ''
  const supplierNameW = watch('supplierName') ?? ''
  const invoiceDateW = watch('invoiceDate') ?? ''
  const baseW = num(watch('baseAmount'))
  // Solo una factura que todavía no tiene gasto puede vincularse a uno que ya existía.
  const canLink = !invoice?.expenseId && !createdId

  useEffect(() => {
    if (!canLink) return
    const rnc = normalizeRnc(supplierRncW)
    if (!(rnc.length === 9 || rnc.length === 11) || !invoiceDateW || total <= 0) {
      setCandidates([])
      setLinkId(null)
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      const res = await findExpenseCandidates({
        supplierRnc: rnc,
        supplierName: supplierNameW.trim(),
        totalAmount: total,
        baseAmount: baseW,
        invoiceDate: invoiceDateW,
      })
      if (cancelled || !res.ok) return
      const found = res.data ?? []
      setCandidates(found)
      // Si el gasto elegido ya no es candidato (cambió el monto o la fecha), se suelta.
      setLinkId((cur) => (cur && found.some((c) => c.expenseId === cur) ? cur : null))
    }, 600)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [canLink, supplierRncW, supplierNameW, invoiceDateW, total, baseW])

  const destinoLabel = linkId
    ? 'Gasto ya registrado (vinculado)'
    : destino === GENERAL_EXPENSE
      ? 'Gasto general (sin proyecto)'
      : destino === PENDING
        ? 'Sin asignar (solo cuenta para el 606)'
        : projects.find((p) => p.id === destino)
          ? `${projects.find((p) => p.id === destino)!.code} — ${projects.find((p) => p.id === destino)!.name}`
          : undefined

  /** Pasa una lectura (IA o QR) al formulario. La persona revisa y guarda; `file` se adjunta como foto. */
  function applyScan(data: ScanResult, file: File | null) {
    const f = data.fields
    const v = { shouldValidate: true }
    setValue('ncf', f.ncf, v)
    setValue('supplierRnc', f.supplierRnc, v)
    setValue('supplierName', f.supplierName, v)
    if (f.invoiceDate) setValue('invoiceDate', f.invoiceDate, v)
    setValue('baseAmount', f.baseAmount ? String(f.baseAmount) : '', v)
    setValue('itbis', f.itbis ? String(f.itbis) : '')
    setValue('isc', f.isc ? String(f.isc) : '')
    setValue('tip', f.tip ? String(f.tip) : '')
    setValue('otherTax', f.otherTax ? String(f.otherTax) : '')
    setValue('paymentMethod', f.paymentMethod)
    if (f.expenseType) setValue('expenseType', f.expenseType, v)
    if (f.securityCode) setValue('securityCode', f.securityCode)
    if (f.notes) setValue('notes', f.notes)
    if (file) setPhoto(file)
    setScanInfo(data)
  }

  /** Lee la factura con IA, rellena el formulario y adjunta esa misma foto. La persona revisa y guarda. */
  async function scan(file: File) {
    setScanning(true)
    setScanInfo(null)
    setServerError(null)
    const form = new FormData()
    form.append('file', file)
    const res = await scanFiscalInvoice(form)
    setScanning(false)
    if (!res.ok || !res.data) {
      setServerError(res.error ?? 'No se pudo leer la factura')
      return
    }
    applyScan(res.data, file)
  }

  /** Lee el código QR de un e-CF (ya decodificado por la cámara) y rellena el formulario. */
  async function onQr(text: string) {
    setQrOpen(false)
    setScanning(true)
    setScanInfo(null)
    setServerError(null)
    const res = await scanQrText(text)
    setScanning(false)
    if (!res.ok || !res.data) {
      setServerError(res.error ?? 'No se pudo leer el código QR')
      return
    }
    applyScan(res.data, null)
  }

  /**
   * Al terminar de escribir el RNC de un proveedor que ya conocemos, sugiere su nombre, su tipo
   * de gasto y su forma de pago habituales. Solo llena lo que la persona no ha tocado.
   */
  async function suggestFromHistory(rawRnc: string) {
    const rnc = normalizeRnc(rawRnc)
    if (invoice || !/^(\d{9}|\d{11})$/.test(rnc)) return
    const res = await suggestForSupplier(rnc)
    const s = res.data
    if (!res.ok || !s || s.count === 0) {
      setHistoryHint(null)
      return
    }
    const used: string[] = []
    if (!getValues('supplierName') && s.supplierName) setValue('supplierName', s.supplierName, { shouldValidate: true })
    if (!getValues('expenseType') && s.expenseType) {
      setValue('expenseType', s.expenseType, { shouldValidate: true })
      used.push('el tipo de gasto')
    }
    if (!dirtyFields.paymentMethod && s.paymentMethod && getValues('paymentMethod') === '01' && s.paymentMethod !== '01') {
      setValue('paymentMethod', s.paymentMethod)
      used.push('la forma de pago')
    }
    setHistoryHint(
      used.length > 0
        ? `Proveedor conocido (${s.count} factura${s.count === 1 ? '' : 's'}): se sugirió ${used.join(' y ')}. Cámbialo si esta compra es distinta.`
        : `Proveedor conocido (${s.count} factura${s.count === 1 ? '' : 's'}).`,
    )
  }

  /** Trae el nombre del emisor del portal de la DGII a partir del RNC. */
  async function searchRnc() {
    const rnc = normalizeRnc(watch('supplierRnc') ?? '')
    if (!/^(\d{9}|\d{11})$/.test(rnc)) {
      setRncHint({ ok: false, text: 'Escribe primero un RNC de 9 dígitos (11 si es cédula)' })
      return
    }
    setSearchingRnc(true)
    setRncHint(null)
    const res = await lookupRncInDgii(rnc)
    setSearchingRnc(false)
    if (!res.ok || !res.data) {
      setRncHint({ ok: false, text: res.error ?? 'No se pudo consultar la DGII' })
      return
    }
    if (!res.data.found) {
      setRncHint({ ok: false, text: res.data.message ?? 'La DGII no encontró ese RNC' })
      return
    }
    setValue('supplierName', res.data.name ?? '', { shouldValidate: true })
    setRncHint({
      ok: true,
      text: `${res.data.status ?? ''}${res.data.isElectronicBiller ? ' · facturador electrónico' : ''}`.trim() || 'Encontrado',
    })
  }

  async function onSubmit(data: FormValues) {
    setServerError(null)
    const input = {
      ncf: normalizeNcf(data.ncf),
      supplierRnc: normalizeRnc(data.supplierRnc),
      supplierName: data.supplierName.trim(),
      baseAmount: num(data.baseAmount),
      itbis: num(data.itbis),
      isc: num(data.isc),
      tip: num(data.tip),
      otherTax: num(data.otherTax),
      paymentMethod: data.paymentMethod,
      expenseType: data.expenseType,
      invoiceDate: data.invoiceDate,
      ...(isEcf(data.ncf) && data.securityCode?.trim() ? { securityCode: data.securityCode.trim() } : {}),
      // Sin asignar = no se manda destino (no se crea ni se toca el gasto). Vinculada a un gasto que
      // ya existía = tampoco: ese gasto ya tiene su proyecto.
      ...(data.destino === PENDING || linkId
        ? {}
        : { projectId: data.destino === GENERAL_EXPENSE ? null : data.destino }),
    }

    let id: string
    if (invoice) {
      const result = await updateFiscalInvoice(invoice.id, { ...input, notes: data.notes?.trim() || null })
      if (!result.ok) {
        setServerError(result.error ?? 'Error desconocido')
        return
      }
      id = invoice.id
      if (canLink && linkId) {
        const link = await linkFiscalInvoiceToExpense(invoice.id, linkId, syncExpense)
        if (!link.ok) {
          setServerError(`Los cambios se guardaron, pero no se pudo vincular al gasto (${link.error}).`)
          return
        }
      }
    } else if (createdId) {
      // Ya se guardó en un intento anterior (solo falló la foto): no se crea otra vez.
      id = createdId
    } else {
      const result = await createFiscalInvoice({
        ...input,
        notes: data.notes?.trim() || undefined,
        ...(linkId ? { expenseId: linkId, syncExpense } : {}),
      })
      if (!result.ok || !result.id) {
        setServerError(result.error ?? 'Error desconocido')
        return
      }
      id = result.id
      setCreatedId(id)
    }

    if (photo) {
      const form = new FormData()
      form.append('file', photo)
      const up = await uploadFiscalInvoicePhoto(id, form)
      if (!up.ok) {
        // La factura ya quedó guardada: se dice claro y el botón pasa a "Reintentar la foto".
        setServerError(`La factura se guardó, pero la foto no se pudo subir (${up.error}). Reintenta la foto o cierra.`)
        return
      }
    }
    // Un QR ya trajo el estado en la DGII: se confirma desde el servidor para que quede guardado en
    // la factura (no se le cree al navegador). Si no se puede, la factura queda "sin validar".
    if (!invoice && !createdId && scanInfo?.estadoDgii) {
      void validateFiscalInvoiceWithDgii(id, input.securityCode).catch(() => undefined)
    }
    onSaved?.({ ncf: input.ncf, supplierName: input.supplierName, total, destino: destinoLabel ?? '' })
    onDone(true)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
      {!invoice && (
        <div className="space-y-2">
          {!prefill && qrOpen && <QrReader onResult={(text) => void onQr(text)} onCancel={() => setQrOpen(false)} />}
          {!prefill && !qrOpen && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed p-3">
            <div>
              <p className="text-sm font-medium">Escanear la factura</p>
              <p className="text-xs text-muted-foreground">
                Foto o PDF (con IA), o el código QR de un e-CF. Se llena el formulario: revisa antes de guardar.
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setQrOpen(true)} disabled={scanning}>
                <QrCode className="size-4 mr-1" />
                Leer QR
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => scanInput.current?.click()} disabled={scanning}>
                {scanning ? 'Leyendo…' : 'Foto con IA'}
              </Button>
            </div>
            <input
              ref={scanInput}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = '' // permite volver a escanear el mismo archivo
                if (file) void scan(file)
              }}
            />
          </div>
          )}
          {scanInfo && (
            <div
              className={`rounded-md border px-3 py-2 text-sm ${
                scanInfo.duplicate
                  ? 'bg-red-50 text-red-800 border-red-200'
                  : scanInfo.warnings.length > 0 || scanInfo.confidence === 'low'
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}
            >
              <p className="font-medium">
                {scanInfo.warnings.length === 0 && scanInfo.confidence !== 'low'
                  ? scanInfo.source === 'qr'
                    ? 'Código QR leído. Confirma los datos.'
                    : 'Factura leída. Confirma los datos.'
                  : `${scanInfo.source === 'qr' ? 'Código QR leído' : 'Factura leída'} (confianza ${{ high: 'alta', medium: 'media', low: 'baja' }[scanInfo.confidence]}). Revisa lo marcado.`}
                {scanInfo.estadoDgii ? ` · DGII: ${scanInfo.estadoDgii}` : ''}
              </p>
              {scanInfo.warnings.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs space-y-0.5">
                  {scanInfo.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              {scanInfo.hints.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs space-y-0.5 text-emerald-800">
                  {scanInfo.hints.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              )}
              {photo && <p className="mt-1 text-xs">Se adjuntará la foto: {photo.name}.</p>}
              {scanInfo.duplicate && <p className="mt-1 text-xs font-medium">No la guardes de nuevo: ya existe en el sistema.</p>}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="f-ncf">NCF / e-NCF <span className="text-destructive">*</span></Label>
          <Input
            id="f-ncf"
            placeholder="B0100000012 · E310000000001"
            className="font-mono"
            {...register('ncf', { onBlur: (e) => setValue('ncf', normalizeNcf(e.target.value)) })}
          />
          {errors.ncf && <p className="text-xs text-destructive">{errors.ncf.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="f-date">Fecha de la factura <span className="text-destructive">*</span></Label>
          <Input id="f-date" type="date" {...register('invoiceDate')} />
          {errors.invoiceDate && <p className="text-xs text-destructive">{errors.invoiceDate.message}</p>}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="f-rnc">RNC / cédula del emisor <span className="text-destructive">*</span></Label>
            <button
              type="button"
              className="text-xs text-primary hover:underline disabled:opacity-50"
              onClick={searchRnc}
              disabled={searchingRnc}
            >
              {searchingRnc ? 'Buscando…' : 'Buscar en la DGII'}
            </button>
          </div>
          <Input
            id="f-rnc"
            placeholder="130991873"
            className="font-mono"
            {...register('supplierRnc', { onBlur: (e) => void suggestFromHistory(e.target.value) })}
          />
          {errors.supplierRnc && <p className="text-xs text-destructive">{errors.supplierRnc.message}</p>}
          {historyHint && <p className="text-xs text-emerald-700">{historyHint}</p>}
          {rncHint && (
            <p className={`text-xs ${rncHint.ok ? 'text-emerald-600' : 'text-amber-600'}`}>{rncHint.text}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="f-name">Nombre del emisor <span className="text-destructive">*</span></Label>
          <Input id="f-name" placeholder="Ferretería…" {...register('supplierName')} />
          {errors.supplierName && <p className="text-xs text-destructive">{errors.supplierName.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="f-base">Monto base (sin impuestos) <span className="text-destructive">*</span></Label>
          <Input id="f-base" type="number" min="0" step="0.01" placeholder="0.00" {...register('baseAmount')} />
          {errors.baseAmount && <p className="text-xs text-destructive">{errors.baseAmount.message}</p>}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="f-itbis">ITBIS</Label>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => setValue('itbis', String(r2(num(watch('baseAmount')) * 0.18)))}
            >
              Calcular 18 %
            </button>
          </div>
          <Input id="f-itbis" type="number" min="0" step="0.01" placeholder="0.00" {...register('itbis')} />
          {errors.itbis && <p className="text-xs text-destructive">{errors.itbis.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="f-isc">ISC</Label>
          <Input id="f-isc" type="number" min="0" step="0.01" placeholder="0.00" {...register('isc')} />
          {errors.isc && <p className="text-xs text-destructive">{errors.isc.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="f-tip">Propina legal (10 %)</Label>
          <Input id="f-tip" type="number" min="0" step="0.01" placeholder="0.00" {...register('tip')} />
          {errors.tip && <p className="text-xs text-destructive">{errors.tip.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="f-other">Otros impuestos</Label>
          <Input id="f-other" type="number" min="0" step="0.01" placeholder="0.00" {...register('otherTax')} />
          {errors.otherTax && <p className="text-xs text-destructive">{errors.otherTax.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Total</Label>
          <div className="h-9 rounded-md border bg-muted/40 px-3 flex items-center text-sm font-semibold tabular-nums">
            {DOP.format(total)}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Tipo de gasto (606) <span className="text-destructive">*</span></Label>
          <Select value={expenseType} onValueChange={(v) => v && setValue('expenseType', v, { shouldValidate: true })}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Seleccionar tipo">{expenseType ? expenseTypeLabel(expenseType) : undefined}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {/* Una factura migrada puede traer un código fuera del 01–11: se conserva visible. */}
              {expenseType && !EXPENSE_TYPE_CODES.includes(expenseType) && (
                <SelectItem value={expenseType}>{expenseType} · (sin catálogo)</SelectItem>
              )}
              {EXPENSE_TYPE_CODES.map((c) => (
                <SelectItem key={c} value={c}>{expenseTypeLabel(c)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.expenseType && <p className="text-xs text-destructive">{errors.expenseType.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Forma de pago</Label>
          <Select value={paymentMethod} onValueChange={(v) => v && setValue('paymentMethod', v)}>
            <SelectTrigger className="w-full">
              <SelectValue>{PAYMENT_METHODS_606[paymentMethod] ?? paymentMethod}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHOD_CODES.map((c) => (
                <SelectItem key={c} value={c}>{PAYMENT_METHODS_606[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isEcf(ncfValue) && (
          <div className="col-span-full space-y-1.5">
            <Label htmlFor="f-seg">Código de seguridad del e-CF (opcional)</Label>
            <Input id="f-seg" placeholder="Sale en el QR; la DGII lo pide para confirmar el e-CF" className="font-mono" {...register('securityCode')} />
            {errors.securityCode && <p className="text-xs text-destructive">{errors.securityCode.message}</p>}
          </div>
        )}

        {canLink && candidates.length > 0 && (
          <div className="col-span-full">
            <GastoCandidatos
              candidates={candidates}
              value={linkId}
              onChange={setLinkId}
              sync={syncExpense}
              onSyncChange={setSyncExpense}
              name={`gasto-candidato-${invoice?.id ?? 'nueva'}`}
            />
          </div>
        )}

        <div className="col-span-full space-y-1.5">
          <Label>Destino del gasto</Label>
          <Select value={destino} onValueChange={(v) => v && setValue('destino', v)} disabled={!!linkId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Elegir destino">{destinoLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={GENERAL_EXPENSE}>Gasto general (sin proyecto)</SelectItem>
              {/* Una factura que ya originó su gasto no puede volver a "sin asignar". */}
              {!invoice?.expenseId && <SelectItem value={PENDING}>Sin asignar (solo cuenta para el 606)</SelectItem>}
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {linkId
              ? 'La factura se vincula al gasto que ya registraste: no se crea otro y el proyecto es el de ese gasto.'
              : 'La factura cuenta para el 606 en cualquier caso. Con destino, además crea su gasto en el ERP.'}
          </p>
        </div>

        <div className="col-span-full space-y-1.5">
          <Label htmlFor="f-notes">Notas</Label>
          <Input id="f-notes" placeholder="Para qué fue la compra…" {...register('notes')} />
        </div>

        <div className="col-span-full space-y-1.5">
          <Label htmlFor="f-photo">
            Foto o PDF del comprobante {invoice?.photoPath ? '(reemplaza la actual)' : '(opcional)'}
          </Label>
          <Input
            id="f-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      {serverError && (
        <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">{serverError}</p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(createdId !== null)}>
          {createdId ? 'Cerrar' : 'Cancelar'}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? 'Guardando...'
            : createdId
              ? 'Reintentar la foto'
              : invoice
                ? 'Guardar cambios'
                : 'Registrar factura'}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function NuevaFacturaDialog({ projects }: { projects: Project[] }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4 mr-1" />
        Nueva factura
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva factura</DialogTitle>
          <DialogDescription>
            Comprobante de compra para el Formato 606. Cuenta para la DGII tenga o no proyecto.
          </DialogDescription>
        </DialogHeader>
        {/* Se monta solo mientras está abierto: nace limpio cada vez, sin lo tecleado antes. */}
        {open && <FacturaForm projects={projects} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}
