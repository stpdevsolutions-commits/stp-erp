'use client'

import { useState, useRef } from 'react'
import { FileText, Download, Trash2, Upload, FolderOpen, Images, BookText, Receipt, Quote } from 'lucide-react'
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
import type { FileUpload, FileContext } from '@/lib/types'
import { uploadFile, deleteFile } from '@/lib/actions/files'

// ── Constants ──────────────────────────────────────────────────────────────────

type ProjectTab = {
  context: FileContext
  label: string
  suffix: string
  icon: React.ElementType
  accept: string
}

const PROJECT_TABS: ProjectTab[] = [
  { context: 'project-photos', label: 'Fotos', suffix: 'photos', icon: Images, accept: 'image/jpeg,image/png,image/webp' },
  { context: 'project-documents', label: 'Documentos', suffix: 'documents', icon: BookText, accept: 'application/pdf,image/jpeg,image/png,image/webp' },
  { context: 'project-expenses', label: 'Comprobantes', suffix: 'expenses', icon: Receipt, accept: 'application/pdf,image/jpeg,image/png,image/webp' },
  { context: 'project-quotes', label: 'Cotizaciones', suffix: 'quotes', icon: Quote, accept: 'application/pdf' },
]

const ACCEPT_ALL = 'image/jpeg,image/png,image/webp,application/pdf'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Upload Dialog ──────────────────────────────────────────────────────────────

function SubirDialog({
  uploadPath,
  contextLabel,
  accept,
}: {
  uploadPath: string
  contextLabel: string
  accept: string
}) {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function pickFile(f: File) {
    if (f.size > 10 * 1024 * 1024) {
      setError('El archivo no puede superar 10 MB')
      return
    }
    setFile(f)
    setError(null)
    if (f.type.startsWith('image/')) {
      if (preview) URL.revokeObjectURL(preview)
      setPreview(URL.createObjectURL(f))
    } else {
      setPreview(null)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) pickFile(f)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) pickFile(f)
  }

  function handleClose() {
    setOpen(false)
    setFile(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const result = await uploadFile(uploadPath, formData)
      if (!result.ok) {
        setError(result.error ?? 'Error al subir')
        return
      }
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir')
    } finally {
      setUploading(false)
    }
  }

  const acceptLabel = accept
    .split(',')
    .map((t) => t.replace('image/', '').replace('application/', '').toUpperCase())
    .join(', ')

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else setOpen(true) }}>
      <DialogTrigger render={<Button size="sm" />}>
        <Upload className="size-4 mr-1.5" />
        Subir archivo
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Subir archivo</DialogTitle>
          <DialogDescription>{contextLabel}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={accept}
            onChange={handleFileChange}
          />

          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors select-none ${
              file
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30'
            }`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {file ? (
              <div className="space-y-2">
                {preview ? (
                  <img
                    src={preview}
                    alt=""
                    className="mx-auto max-h-36 rounded object-contain"
                  />
                ) : (
                  <FileText className="size-12 text-red-500 mx-auto" />
                )}
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation()
                    setFile(null)
                    if (preview) { URL.revokeObjectURL(preview); setPreview(null) }
                    if (inputRef.current) inputRef.current.value = ''
                  }}
                >
                  Cambiar archivo
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Upload className="size-8 mx-auto text-muted-foreground/50" />
                <p className="text-sm font-medium">Arrastra o haz clic para seleccionar</p>
                <p className="text-xs text-muted-foreground">
                  {acceptLabel} · Máx. 10 MB
                </p>
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={uploading}>
            Cancelar
          </Button>
          <Button onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? 'Subiendo...' : 'Subir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Delete Button ──────────────────────────────────────────────────────────────

function DeleteButton({ id }: { id: string }) {
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    if (!confirm('¿Eliminar este archivo? Esta acción no se puede deshacer.')) return
    setLoading(true)
    await deleteFile(id)
    setLoading(false)
  }

  return (
    <Button
      size="icon-sm"
      variant="destructive"
      onClick={handleDelete}
      disabled={loading}
    >
      <Trash2 className="size-3.5" />
    </Button>
  )
}

// ── File Grid ─────────────────────────────────────────────────────────────────

function FileGrid({
  files,
  canDelete,
}: {
  files: FileUpload[]
  canDelete: boolean
}) {
  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
        <FolderOpen className="size-10 mb-2 opacity-30" />
        <p className="text-sm">No hay archivos en esta categoría.</p>
      </div>
    )
  }

  const images = files.filter((f) => f.mimetype.startsWith('image/'))
  const docs = files.filter((f) => !f.mimetype.startsWith('image/'))

  return (
    <div className="space-y-6">
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {images.map((file) => (
            <div
              key={file.id}
              className="group relative aspect-square rounded-lg overflow-hidden border bg-muted"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/files/${file.id}/download`}
                alt={file.originalName}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <a
                  href={`/api/files/${file.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button size="icon-sm" variant="secondary">
                    <Download className="size-3.5" />
                  </Button>
                </a>
                {canDelete && <DeleteButton id={file.id} />}
              </div>
              <p className="absolute bottom-0 left-0 right-0 text-xs text-white bg-black/60 px-1.5 py-0.5 truncate">
                {file.originalName}
              </p>
            </div>
          ))}
        </div>
      )}

      {docs.length > 0 && (
        <div className="space-y-1">
          {docs.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <FileText className="size-8 text-red-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.originalName}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(file.size)} ·{' '}
                  {new Date(file.createdAt).toLocaleDateString('es-DO')}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={`/api/files/${file.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="icon-sm" variant="outline">
                    <Download className="size-3.5" />
                  </Button>
                </a>
                {canDelete && <DeleteButton id={file.id} />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Viewer ─────────────────────────────────────────────────────────────────────

export function ArchivoViewer({
  files,
  clientId,
  projectId,
  canDelete,
}: {
  files: FileUpload[]
  clientId: string
  projectId?: string
  canDelete: boolean
}) {
  const [activeTab, setActiveTab] = useState<FileContext>(
    projectId ? 'project-photos' : 'client-profile',
  )

  // ── Client-only view (profile) ─────────────────────────────────────────────

  if (!projectId) {
    const profileFiles = files.filter((f) => f.context === 'client-profile')
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-sm font-medium">
            <Images className="size-4" />
            Perfil
            <span className="text-muted-foreground">({profileFiles.length})</span>
          </div>
          <SubirDialog
            uploadPath={`/files/clients/${clientId}/profile`}
            contextLabel="Imagen de perfil del cliente"
            accept="image/jpeg,image/png,image/webp"
          />
        </div>
        <FileGrid files={profileFiles} canDelete={canDelete} />
      </div>
    )
  }

  // ── Project view (4 tabs) ──────────────────────────────────────────────────

  const activeTabDef = PROJECT_TABS.find((t) => t.context === activeTab)!
  const tabFiles = files.filter((f) => f.context === activeTab)

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {PROJECT_TABS.map((tab) => {
            const count = files.filter((f) => f.context === tab.context).length
            const isActive = activeTab === tab.context
            return (
              <button
                key={tab.context}
                onClick={() => setActiveTab(tab.context)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <tab.icon className="size-3.5" />
                {tab.label}
                {count > 0 && (
                  <span
                    className={`text-xs tabular-nums rounded-full px-1.5 py-0.5 ${
                      isActive ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/20'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <SubirDialog
          uploadPath={`/files/clients/${clientId}/projects/${projectId}/${activeTabDef.suffix}`}
          contextLabel={activeTabDef.label}
          accept={activeTabDef.accept}
        />
      </div>

      <FileGrid files={tabFiles} canDelete={canDelete} />
    </div>
  )
}
