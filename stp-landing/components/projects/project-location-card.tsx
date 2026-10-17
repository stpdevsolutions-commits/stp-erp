'use client'

import { useState } from 'react'
import { Crosshair, MapPin, Navigation, Copy, Pencil, Trash2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateProject } from '@/lib/actions/projects'
import { formatCoords, isValidCoords, mapLinks, parseCoordInput } from '@/lib/maps-links'
import { useCaptureLocation } from '@/components/projects/use-capture-location'

/** Selector "Ir con…": Google Maps, Waze, Apple Maps o copiar las coordenadas. */
function NavigateDialog({
  open,
  onOpenChange,
  name,
  latitude,
  longitude,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  name: string
  latitude: number
  longitude: number
}) {
  const links = mapLinks(latitude, longitude)
  const options = [
    { label: 'Google Maps', href: links.google },
    { label: 'Waze', href: links.waze },
    { label: 'Apple Maps', href: links.apple },
  ]

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatCoords(latitude, longitude))
      toast.success('Coordenadas copiadas')
      onOpenChange(false)
    } catch {
      toast.error('No se pudo copiar. Selecciona las coordenadas y cópialas a mano.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Ir al proyecto</DialogTitle>
          <DialogDescription>
            {name} — {formatCoords(latitude, longitude)}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {options.map((o) => (
            <Button
              key={o.label}
              variant="outline"
              className="justify-start"
              render={<a href={o.href} target="_blank" rel="noopener noreferrer" />}
              onClick={() => onOpenChange(false)}
            >
              <Navigation className="size-4 mr-1.5" />
              {o.label}
            </Button>
          ))}
          <Button variant="outline" className="justify-start" onClick={copy}>
            <Copy className="size-4 mr-1.5" />
            Copiar coordenadas
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ProjectLocationCard({
  projectId,
  projectName,
  latitude,
  longitude,
  locationNote,
}: {
  projectId: string
  projectName: string
  latitude?: number | null
  longitude?: number | null
  locationNote?: string | null
}) {
  const hasLocation = latitude != null && longitude != null && isValidCoords(latitude, longitude)
  const [navOpen, setNavOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [latText, setLatText] = useState('')
  const [lonText, setLonText] = useState('')
  const [noteText, setNoteText] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const { capture, capturing } = useCaptureLocation()

  function startEdit() {
    setLatText(hasLocation ? String(latitude) : '')
    setLonText(hasLocation ? String(longitude) : '')
    setNoteText(locationNote ?? '')
    setFormError(null)
    setEditing(true)
  }

  async function persist(data: { latitude: number | null; longitude: number | null; locationNote: string | null }) {
    setSaving(true)
    const result = await updateProject(projectId, data)
    setSaving(false)
    if (!result.ok) {
      toast.error(result.error ?? 'No se pudo guardar la ubicación')
      return false
    }
    return true
  }

  // Captura con el GPS: rellena el formulario si se está editando; si no, guarda directo.
  async function handleCapture() {
    const pos = await capture()
    if (!pos) return
    if (editing) {
      setLatText(String(pos.latitude))
      setLonText(String(pos.longitude))
      toast.info(`Ubicación capturada (precisión ≈ ${Math.round(pos.accuracy)} m). Revisa y guarda.`)
      return
    }
    const ok = await persist({
      latitude: pos.latitude,
      longitude: pos.longitude,
      locationNote: locationNote ?? null,
    })
    if (ok) toast.success(`Ubicación guardada (precisión ≈ ${Math.round(pos.accuracy)} m)`)
  }

  async function handleSave() {
    const lat = parseCoordInput(latText)
    const lon = parseCoordInput(lonText)
    const note = noteText.trim()
    if (lat == null && lon == null) {
      // Sin coordenadas: solo se conserva la referencia (o se borra todo si tampoco hay nota).
      if (await persist({ latitude: null, longitude: null, locationNote: note || null })) {
        toast.success('Ubicación actualizada')
        setEditing(false)
      }
      return
    }
    if (lat == null || lon == null) {
      setFormError('Escribe latitud y longitud, o deja ambas vacías.')
      return
    }
    if (!isValidCoords(lat, lon)) {
      setFormError('La latitud va de -90 a 90 y la longitud de -180 a 180.')
      return
    }
    if (await persist({ latitude: lat, longitude: lon, locationNote: note || null })) {
      toast.success('Ubicación guardada')
      setEditing(false)
    }
  }

  async function handleRemove() {
    if (await persist({ latitude: null, longitude: null, locationNote: null })) {
      toast.success('Ubicación quitada')
      setRemoveOpen(false)
      setEditing(false)
    }
  }

  return (
    <Card>
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="size-3.5" />
            <span className="text-xs">Ubicación GPS</span>
          </div>
          {!editing && (
            <div className="flex flex-wrap items-center gap-2">
              {hasLocation && (
                <Button size="sm" onClick={() => setNavOpen(true)}>
                  <Navigation className="size-4 mr-1.5" />
                  Ir
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={handleCapture} disabled={capturing || saving}>
                <Crosshair className="size-4 mr-1.5" />
                {capturing ? 'Obteniendo GPS...' : 'Capturar mi ubicación actual'}
              </Button>
              <Button size="sm" variant="ghost" onClick={startEdit}>
                <Pencil className="size-4 mr-1.5" />
                Editar
              </Button>
              {(hasLocation || locationNote) && (
                <Button size="sm" variant="ghost" onClick={() => setRemoveOpen(true)}>
                  <Trash2 className="size-4 mr-1.5" />
                  Quitar
                </Button>
              )}
            </div>
          )}
        </div>

        {!editing ? (
          hasLocation ? (
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              className="block w-full text-left rounded-md hover:bg-muted/50 -mx-1 px-1 py-0.5"
            >
              <p className="font-mono text-sm">{formatCoords(latitude!, longitude!)}</p>
              {locationNote && <p className="text-sm text-muted-foreground">{locationNote}</p>}
              <p className="text-xs text-muted-foreground mt-0.5">Toca para abrir en Google Maps, Waze o Apple Maps</p>
            </button>
          ) : (
            <div>
              <p className="text-sm">{locationNote || 'Sin ubicación GPS registrada.'}</p>
              {!locationNote && (
                <p className="text-xs text-muted-foreground">
                  Captúrala desde el teléfono cuando estés en el sitio.
                </p>
              )}
            </div>
          )
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="loc-lat">Latitud</Label>
                <Input
                  id="loc-lat"
                  inputMode="decimal"
                  placeholder="18.486058"
                  value={latText}
                  onChange={(e) => setLatText(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loc-lon">Longitud</Label>
                <Input
                  id="loc-lon"
                  inputMode="decimal"
                  placeholder="-69.931212"
                  value={lonText}
                  onChange={(e) => setLonText(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loc-note">Referencia o dirección</Label>
              <Input
                id="loc-note"
                maxLength={500}
                placeholder="Ej. Frente al colmado, portón azul"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
              />
            </div>
            {formError && (
              <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">{formError}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={handleCapture} disabled={capturing || saving}>
                <Crosshair className="size-4 mr-1.5" />
                {capturing ? 'Obteniendo GPS...' : 'Capturar mi ubicación actual'}
              </Button>
              <div className="flex-1" />
              <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {hasLocation && (
        <NavigateDialog
          open={navOpen}
          onOpenChange={setNavOpen}
          name={projectName}
          latitude={latitude!}
          longitude={longitude!}
        />
      )}

      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Quitar ubicación</DialogTitle>
            <DialogDescription>
              Se borrarán las coordenadas y la referencia de {projectName}. Podrás capturarlas de nuevo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleRemove} disabled={saving}>
              {saving ? 'Quitando...' : 'Quitar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
