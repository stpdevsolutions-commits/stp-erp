'use client'

import { useState, useTransition } from 'react'
import { Archive, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { archivarInforme, type TipoInforme } from '@/lib/actions/project-reports'

/**
 * Botón "Guardar en el proyecto": genera el PDF del informe y lo archiva como
 * archivo del proyecto.
 *
 * Va separado de los botones PDF/Excel a propósito. Esos son vista previa —
 * miras el documento y no queda rastro. Este archiva, y por eso es una acción
 * distinta con su propia confirmación: el objetivo es que la carpeta de informes
 * contenga lo que alguien decidió archivar, no cada vez que se abrió el PDF.
 *
 * Tras guardar se dice el nombre exacto del archivo y dónde aparecerá, porque la
 * queja original era justamente no saber dónde quedaba guardado.
 */
export function ArchivarInforme({
  projectId,
  tipo,
}: {
  projectId: string
  tipo: TipoInforme
}) {
  const [guardando, startTransition] = useTransition()
  const [nombre, setNombre] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function onArchivar() {
    setError(null)
    setNombre(null)
    startTransition(async () => {
      const res = await archivarInforme(projectId, tipo)
      if (!res.ok) {
        setError(res.error ?? 'No se pudo guardar')
        return
      }
      setNombre(res.nombre ?? 'Informe guardado')
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" onClick={onArchivar} disabled={guardando}>
        <Archive className="size-4 mr-1.5" />
        {guardando ? 'Guardando…' : 'Guardar en el proyecto'}
      </Button>

      {nombre && (
        <span className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
          <Check className="size-3.5" />
          Guardado como «{nombre}» en Archivos → Informes
        </span>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
