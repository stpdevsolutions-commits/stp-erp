'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload } from 'lucide-react'
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
import { uploadPriceImport } from '@/lib/actions/price-imports'
import type { Supplier } from '@/lib/types'

const MAX_SIZE = 10 * 1024 * 1024

export function SubirCotizacionDialog({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [supplierId, setSupplierId] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function close() {
    setOpen(false)
    setFile(null)
    setSupplierId('')
    setNotes('')
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  function pick(selected: File | null) {
    setError(null)
    if (!selected) {
      setFile(null)
      return
    }
    if (selected.type !== 'application/pdf') {
      setError('Solo se admiten PDF')
      return
    }
    if (selected.size > MAX_SIZE) {
      setError('El archivo supera los 10 MB')
      return
    }
    setFile(selected)
  }

  async function submit() {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      if (supplierId) formData.append('supplierId', supplierId)
      if (notes.trim()) formData.append('notes', notes.trim())

      const result = await uploadPriceImport(formData)
      if (!result.ok) {
        setError(result.error ?? 'Error al subir')
        return
      }
      close()
      // Va al detalle: es donde se verá aparecer el resultado de la extracción.
      if (result.id) router.push(`/dashboard/costos/importar/${result.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogTrigger render={<Button size="sm" />}>
        <Upload className="size-4 mr-1.5" />
        Subir cotización
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Subir cotización de proveedor</DialogTitle>
          <DialogDescription>
            La IA extrae los renglones del PDF. Ninguno entra al historial de precios
            hasta que lo apruebes tú.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="file">
              Documento PDF <span className="text-destructive">*</span>
            </Label>
            <Input
              id="file"
              ref={inputRef}
              type="file"
              accept="application/pdf"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="text-muted-foreground text-xs">
                {file.name} · {(file.size / 1024).toFixed(0)} KB
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="supplier">Proveedor</Label>
            <Select value={supplierId} onValueChange={(v) => setSupplierId(v ?? '')}>
              <SelectTrigger id="supplier">
                <SelectValue placeholder="Sin proveedor" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Se usa para todos los precios del documento. Se elige aquí en vez de leerlo
              del PDF: ya lo sabes y así no hay que verificarlo.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Nota</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional"
            />
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={uploading}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!file || uploading}>
            {uploading ? 'Subiendo…' : 'Subir y extraer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
