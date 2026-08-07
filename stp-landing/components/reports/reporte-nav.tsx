'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Project, Client } from '@/lib/types'

type TabKey = 'general' | 'proyecto' | 'cliente' | 'ingresos' | 'gastos' | 'fichas'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'proyecto', label: 'Proyecto' },
  { key: 'cliente', label: 'Cliente' },
  { key: 'ingresos', label: 'Ingresos' },
  { key: 'gastos', label: 'Gastos' },
  { key: 'fichas', label: 'Fichas' },
]

const PROJECT_STATUS_LABELS: Record<Project['status'], string> = {
  draft: 'Pendiente',
  active: 'En curso',
  on_hold: 'En pausa',
  completed: 'Completado',
  cancelled: 'Cancelado',
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonthStr() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

/** YYYY-MM-DD en hora local (sin el salto de día que provoca toISOString). */
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Períodos del reporte general. Todos terminan hoy: lo que se quiere saber es
 * cómo va el mes/trimestre/año en curso, no cómo fue el anterior completo.
 */
const PERIODOS: { key: string; label: string; rango: () => { from: string; to: string } }[] = [
  {
    key: 'mes',
    label: 'Este mes',
    rango: () => {
      const hoy = new Date()
      return { from: ymd(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), to: ymd(hoy) }
    },
  },
  {
    key: 'trimestre',
    label: 'Este trimestre',
    rango: () => {
      const hoy = new Date()
      const mes = Math.floor(hoy.getMonth() / 3) * 3
      return { from: ymd(new Date(hoy.getFullYear(), mes, 1)), to: ymd(hoy) }
    },
  },
  {
    key: 'anio',
    label: 'Este año',
    rango: () => {
      const hoy = new Date()
      return { from: ymd(new Date(hoy.getFullYear(), 0, 1)), to: ymd(hoy) }
    },
  },
]

export function ReporteNav({
  projects,
  clients,
  activeProyecto,
  activeCliente,
  activeView,
  activeFrom,
  activeTo,
  activeTab,
}: {
  projects: Project[]
  clients: Client[]
  activeProyecto?: string
  activeCliente?: string
  activeView?: string
  activeFrom?: string
  activeTo?: string
  activeTab?: string
}) {
  const router = useRouter()

  const currentTab: TabKey = activeProyecto
    ? 'proyecto'
    : activeCliente
    ? 'cliente'
    : (activeView as TabKey) ?? (activeTab as TabKey) ?? 'proyecto'

  const [from, setFrom] = useState(activeFrom ?? firstOfMonthStr())
  const [to, setTo] = useState(activeTo ?? todayStr())

  function handleTabClick(tab: TabKey) {
    if (tab === 'proyecto') {
      router.push('/dashboard/reportes')
    } else if (tab === 'cliente') {
      router.push('/dashboard/reportes?tab=cliente')
    } else {
      router.push(`/dashboard/reportes?view=${tab}&from=${from}&to=${to}`)
    }
  }

  function handleDateReport(view: string) {
    router.push(`/dashboard/reportes?view=${view}&from=${from}&to=${to}`)
  }

  const selectedProject = projects.find((p) => p.id === activeProyecto)
  const selectedClient = clients.find((c) => c.id === activeCliente)

  return (
    <div className="space-y-3">
      {/* Tab bar */}
      <div className="flex gap-1 border-b pb-0">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabClick(tab.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors',
              currentTab === tab.key
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {currentTab === 'proyecto' && (
        <div className="space-y-1.5">
          <Select
            value={activeProyecto ?? ''}
            onValueChange={(v) => {
              if (v) router.push(`/dashboard/reportes?proyecto=${v}`)
              else router.push('/dashboard/reportes')
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar proyecto...">
                {selectedProject
                  ? `${selectedProject.code} — ${selectedProject.name}`
                  : undefined}
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
      )}

      {currentTab === 'cliente' && (
        <div className="space-y-1.5">
          <Select
            value={activeCliente ?? ''}
            onValueChange={(v) => {
              if (v) router.push(`/dashboard/reportes?cliente=${v}`)
              else router.push('/dashboard/reportes')
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
      )}

      {/* Atajos de período: solo en el reporte general, que es el que se mira por trimestre o año. */}
      {currentTab === 'general' && (
        <div className="flex flex-wrap items-center gap-2">
          {PERIODOS.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant="outline"
              onClick={() => {
                const r = p.rango()
                setFrom(r.from)
                setTo(r.to)
                router.push(`/dashboard/reportes?view=general&from=${r.from}&to=${r.to}`)
              }}
            >
              {p.label}
            </Button>
          ))}
          <span className="text-xs text-muted-foreground">o un rango libre:</span>
        </div>
      )}

      {(currentTab === 'general' ||
        currentTab === 'ingresos' ||
        currentTab === 'gastos' ||
        currentTab === 'fichas') && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Desde</p>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Hasta</p>
            <input
              type="date"
              value={to}
              min={from}
              max={todayStr()}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <Button
            size="sm"
            onClick={() => handleDateReport(currentTab)}
          >
            Ver reporte
          </Button>
        </div>
      )}
    </div>
  )
}
