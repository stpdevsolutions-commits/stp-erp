'use client'

import { useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Client, Project } from '@/lib/types'

const STATUS_LABELS: Record<Project['status'], string> = {
  draft: 'Pendiente',
  active: 'En curso',
  on_hold: 'En pausa',
  completed: 'Completado',
  cancelled: 'Cancelado',
}

export function ArchivoNav({
  clients,
  projects,
  activeCliente,
  activeProyecto,
}: {
  clients: Client[]
  projects: Project[]
  activeCliente?: string
  activeProyecto?: string
}) {
  const router = useRouter()

  const selectedClient = clients.find((c) => c.id === activeCliente)
  const selectedProject = projects.find((p) => p.id === activeProyecto)
  const clientProjects = activeCliente
    ? projects.filter((p) => p.clientId === activeCliente)
    : []

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Cliente</p>
        <Select
          value={activeCliente ?? ''}
          onValueChange={(v) => {
            if (v) router.push(`/dashboard/archivos?cliente=${v}`)
            else router.push('/dashboard/archivos')
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar cliente...">
              {selectedClient?.name}
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

      <div className="space-y-1.5">
        <p className="text-sm font-medium">Proyecto <span className="text-muted-foreground font-normal">(opcional)</span></p>
        <Select
          value={activeProyecto ?? ''}
          disabled={!activeCliente}
          onValueChange={(v) => {
            if (v) router.push(`/dashboard/archivos?cliente=${activeCliente}&proyecto=${v}`)
            else router.push(`/dashboard/archivos?cliente=${activeCliente}`)
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder={activeCliente ? 'Ver perfil del cliente...' : 'Primero elige un cliente'}>
              {selectedProject ? `${selectedProject.code} — ${selectedProject.name}` : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">— Perfil del cliente —</SelectItem>
            {clientProjects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <span className="font-mono text-xs mr-1">{p.code}</span>
                {p.name}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  ({STATUS_LABELS[p.status]})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
