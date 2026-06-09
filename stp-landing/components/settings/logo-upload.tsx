'use client'

import { useState, useRef } from 'react'
import { Upload, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { uploadLogo } from '@/lib/actions/settings'

export function LogoUpload() {
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setSuccess(false)

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Solo se permiten imágenes JPG, PNG o WEBP.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('El archivo supera el límite de 10 MB.')
      return
    }

    const url = URL.createObjectURL(file)
    setPreview(url)
  }

  async function handleUpload() {
    const file = inputRef.current?.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)
    setSuccess(false)

    const fd = new FormData()
    fd.append('file', file)

    const result = await uploadLogo(fd)
    setUploading(false)

    if (!result.ok) {
      setError(result.error ?? 'Error al subir el logo')
      return
    }
    setSuccess(true)
  }

  return (
    <div className="space-y-4">
      {/* Current logo */}
      <div className="flex items-center gap-4">
        <div className="w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center bg-muted/30 overflow-hidden">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Preview" className="w-full h-full object-contain" />
          ) : (
            <>
              {/* Try to load existing logo */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/api/settings/logo"
                alt="Logo actual"
                className="w-full h-full object-contain"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <ImageIcon className="size-8 text-muted-foreground/40" />
            </>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Sube el logo de tu empresa para que aparezca en los PDFs de cotizaciones.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-4 mr-2" />
            Seleccionar imagen
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      {preview && (
        <Button onClick={handleUpload} disabled={uploading} size="sm">
          {uploading ? 'Subiendo...' : 'Guardar logo'}
        </Button>
      )}

      {error && (
        <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">{error}</p>
      )}
      {success && (
        <p className="text-sm text-green-700 rounded-md bg-green-50 px-3 py-2">
          Logo actualizado correctamente.
        </p>
      )}
    </div>
  )
}
