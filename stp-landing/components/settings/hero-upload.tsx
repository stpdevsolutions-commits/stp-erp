'use client'

import { toast } from '@/lib/toast'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ImageIcon, Upload, Undo2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { resetHero, uploadHero } from '@/lib/actions/settings'

type Props = { hasImage: boolean; version: string | null; caption: string }

/** Imagen destacada de la pantalla de Inicio. Sin imagen, Inicio usa el plano de marca. */
export function HeroUpload({ hasImage, version, caption }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [text, setText] = useState(caption)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setDone(null)
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Solo se permiten imágenes JPG, PNG o WEBP.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('El archivo supera el límite de 10 MB.')
      return
    }
    setPreview(URL.createObjectURL(file))
  }

  async function onSave() {
    const file = inputRef.current?.files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('caption', text)
    const r = await uploadHero(fd)
    setBusy(false)
    if (!r.ok) return setError(r.error ?? 'Error al subir la imagen')
    toast.success('Imagen destacada actualizada')
    setDone('Imagen actualizada. Ya se ve en Inicio.')
    router.refresh()
  }

  async function onReset() {
    setBusy(true)
    setError(null)
    const r = await resetHero()
    setBusy(false)
    if (!r.ok) return setError(r.error ?? 'No se pudo restablecer')
    setPreview(null)
    setDone('Se restableció el plano de STP.')
    router.refresh()
  }

  const current = preview ?? (hasImage ? `/api/settings/hero?v=${version ?? ''}` : null)

  return (
    <div className="space-y-4">
      <div className="relative aspect-[16/6] w-full overflow-hidden rounded-lg border bg-brand-deep">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt="Vista previa de la imagen destacada" className="size-full object-cover" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-sm text-white/70">
            <ImageIcon className="size-6" />
            Se usa el plano de STP (sin foto)
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="hero-caption">Pie de foto (opcional)</Label>
        <Input
          id="hero-caption"
          value={text}
          maxLength={120}
          placeholder="Ej. Proyecto destacado: Residencial Los Prados"
          onChange={(e) => setText(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <Upload className="size-4" /> Seleccionar imagen
        </Button>
        {preview && (
          <Button type="button" size="sm" onClick={onSave} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} Guardar imagen
          </Button>
        )}
        {hasImage && !preview && (
          <Button type="button" variant="ghost" size="sm" onClick={onReset} disabled={busy}>
            <Undo2 className="size-4" /> Volver al plano de STP
          </Button>
        )}
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPick} />
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {done && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-400">
          {done}
        </p>
      )}
    </div>
  )
}
