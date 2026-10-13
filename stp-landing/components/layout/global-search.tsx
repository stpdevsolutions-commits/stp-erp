'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Loader2, Users, FolderKanban, FileText, CheckSquare, FolderOpen, HardHat } from 'lucide-react'
import type { SearchResponse } from '@/lib/types'
import { cn } from '@/lib/utils'
import { visibleGroups } from '@/lib/nav'

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const CATEGORY_CONFIG = [
  { key: 'clients', label: 'Clientes', icon: Users },
  { key: 'projects', label: 'Proyectos', icon: FolderKanban },
  { key: 'quotes', label: 'Cotizaciones', icon: FileText },
  { key: 'tasks', label: 'Tareas', icon: CheckSquare },
  { key: 'files', label: 'Archivos', icon: FolderOpen },
  { key: 'collaborators', label: 'Colaboradores', icon: HardHat },
] as const satisfies { key: keyof SearchResponse; label: string; icon: typeof Search }[]

export function GlobalSearch({
  role = 'user',
  modules,
}: {
  role?: string
  modules?: Record<string, string>
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  // En celular el campo no cabe en la barra superior: una lupa lo abre como
  // barra a todo el ancho (antes el buscador simplemente no existía en móvil).
  const [mobileOpen, setMobileOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setMobileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Ctrl/⌘+K abre la búsqueda desde cualquier pantalla
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setMobileOpen(true)
        setOpen(true)
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const term = query.trim()
    // Con menos de 2 letras no se busca; el menú tampoco se muestra
    // (showDropdown), así que no hace falta limpiar estado aquí.
    if (term.length < 2) return
    // Cada cambio de texto cancela la petición anterior (cleanup): una respuesta lenta
    // de "ab" ya no puede pisar los resultados de "abc".
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!controller.signal.aborted) setResults(data)
        })
        .catch(() => {})
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 300)
    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [query])

  function handleSelect(href: string) {
    setOpen(false)
    setMobileOpen(false)
    setQuery('')
    setResults(null)
    router.push(href)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false)
      setMobileOpen(false)
      inputRef.current?.blur()
    }
  }

  // Navegación por módulos: instantánea, sin API, solo lo que el rol puede abrir
  const q = norm(query.trim())
  const moduleMatches = q
    ? visibleGroups(role, modules)
        .flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })))
        .filter((i) => norm(`${i.label} ${i.description ?? ''} ${i.group ?? ''}`).includes(q))
        .slice(0, 5)
    : []

  const hasResults = results && Object.values(results).some((arr) => arr.length > 0)
  const showDropdown = open && query.trim().length >= 1

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Buscar en el ERP"
        onClick={() => {
          setMobileOpen(true)
          setOpen(true)
          setTimeout(() => inputRef.current?.focus(), 0)
        }}
        className="flex size-8 max-md:size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden"
      >
        <Search className="size-4" />
      </button>

      <div
        className={cn(
          mobileOpen
            ? 'fixed inset-x-0 top-0 z-50 flex items-center gap-2 border-b bg-background p-2'
            : 'hidden',
          'sm:static sm:z-auto sm:flex sm:border-0 sm:bg-transparent sm:p-0',
        )}
      >
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            // El "Buscando…" arranca al escribir, no dentro del efecto.
            if (e.target.value.trim().length >= 2) setLoading(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar o ir a… (Ctrl+K)"
          className="w-full rounded-md border bg-muted/50 py-1.5 pl-8 pr-7 text-base sm:text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setResults(null)
              inputRef.current?.focus()
            }}
            className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {mobileOpen && (
        <button
          type="button"
          onClick={() => {
            setMobileOpen(false)
            setOpen(false)
          }}
          className="shrink-0 px-1 text-sm font-medium text-muted-foreground sm:hidden"
        >
          Cancelar
        </button>
      )}
      </div>

      {showDropdown && (
        <div className="absolute right-0 top-full z-50 mt-1.5 max-h-[70vh] w-[28rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border bg-background shadow-lg max-sm:fixed max-sm:inset-x-2 max-sm:top-14 max-sm:mt-0 max-sm:w-auto max-sm:max-w-none">
          {moduleMatches.length > 0 && (
            <div className="border-b px-1.5 py-1.5">
              <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Ir a</p>
              {moduleMatches.map((m) => (
                <button
                  key={m.href}
                  type="button"
                  onClick={() => handleSelect(m.href)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <m.icon className="size-3.5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{m.label}</span>
                    {m.group && <span className="block truncate text-xs text-muted-foreground">{m.group}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
          {query.trim().length < 2 ? (
            moduleMatches.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Sigue escribiendo para buscar registros…</p>
            )
          ) : loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Buscando…
            </div>
          ) : !hasResults ? (
            moduleMatches.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Sin resultados para &quot;{query}&quot;
              </p>
            )
          ) : (
            <div className="py-1.5">
              {CATEGORY_CONFIG.map(({ key, label, icon: Icon }) => {
                const items = results![key]
                if (items.length === 0) return null
                return (
                  <div key={key} className="px-1.5 py-1">
                    <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{label}</p>
                    {items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelect(item.href)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2">{item.label}</span>
                          {item.sublabel && (
                            <span className="block truncate text-xs text-muted-foreground">{item.sublabel}</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
