'use client'

import { useRouter } from 'next/navigation'
import { BuscadorSelect } from '@/components/ui/buscador-select'
import type { Project } from '@/lib/types'

export function ProyectoSelector({
  projects,
  selectedId,
}: {
  projects: Project[]
  selectedId: string
}) {
  const router = useRouter()

  const opciones = projects.map((p) => ({
    value: p.id,
    label: p.name,
    hint: `${p.code} · ${p.client?.name ?? 'sin cliente'}`,
  }))

  return (
    <div className="max-w-md">
      <BuscadorSelect
        opciones={opciones}
        value={selectedId}
        placeholder="Buscar proyecto por nombre o código"
        vacio="Ningún proyecto coincide"
        onValueChange={(v) => {
          if (v) router.push(`/dashboard/cronograma?proyecto=${v}`)
        }}
      />
    </div>
  )
}
