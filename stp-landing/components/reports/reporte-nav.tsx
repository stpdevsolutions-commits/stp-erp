'use client'

import { useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Project, Client } from '@/lib/types'

const PROJECT_STATUS_LABELS: Record<Project['status'], string> = {
  draft: 'Pendiente',
  active: 'En curso',
  on_hold: 'En pausa',
  completed: 'Completado',
  cancelled: 'Cancelado',
}

export function ReporteNav({
  projects,
  clients,
  activeProyecto,
  activeCliente,
}: {
  projects: Project[]
  clients: Client[]
  activeProyecto?: string
  activeCliente?: string
}) {
  const router = useRouter()

  const selectedProject = projects.find((p) => p.id === activeProyecto)
  const selectedProjectLabel = selectedProject
    ? `${selectedProject.code} — ${selectedProject.name}`
    : undefined

  const selectedClient = clients.find((c) => c.id === activeCliente)
  const selectedClientLabel = selectedClient?.name

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Reporte de proyecto</p>
        <Select
          value={activeProyecto ?? ''}
          onValueChange={(v) => {
            if (v) router.push(`/dashboard/reportes?proyecto=${v}`)
            else router.push('/dashboard/reportes')
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar proyecto...">
              {selectedProjectLabel}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">— Ninguno —</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <span className="font-mono text-xs mr-1">{p.code}</span>
                {p.name}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  ({PROJECT_STATUS_LABELS[p.status]})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">Balance de cliente</p>
        <Select
          value={activeCliente ?? ''}
          onValueChange={(v) => {
            if (v) router.push(`/dashboard/reportes?cliente=${v}`)
            else router.push('/dashboard/reportes')
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar cliente...">
              {selectedClientLabel}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">— Ninguno —</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
