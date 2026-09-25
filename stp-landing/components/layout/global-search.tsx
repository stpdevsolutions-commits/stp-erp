'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Loader2, Users, FolderKanban, FileText, CheckSquare, FolderOpen, HardHat } from 'lucide-react'
import type { SearchResponse } from '@/lib/types'

const CATEGORY_CONFIG = [
  { key: 'clients', label: 'Clientes', icon: Users },
  { key: 'projects', label: 'Proyectos', icon: FolderKanban },
  { key: 'quotes', label: 'Cotizaciones', icon: FileText },
  { key: 'tasks', label: 'Tareas', icon: CheckSquare },
  { key: 'files', label: 'Archivos', icon: FolderOpen },
  { key: 'collaborators', label: 'Colaboradores', icon: HardHat },
] as const satisfies { key: keyof SearchResponse; label: string; icon: typeof Search }[]

export function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) {
      setResults(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const timeout = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => setResults(data))
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(timeout)
  }, [query])

  function handleSelect(href: string) {
    setOpen(false)
    setQuery('')
    setResults(null)
    router.push(href)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  const hasResults = results && Object.values(results).some((arr) => arr.length > 0)
  const showDropdown = open && query.trim().length >= 2

  return (
    <div ref={containerRef} className="relative hidden sm:block">
      <div className="relative w-56">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar en el ERP…"
          className="w-full rounded-md border bg-muted/50 py-1.5 pl-8 pr-7 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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

      {showDropdown && (
        <div className="absolute right-0 top-full z-50 mt-1.5 max-h-[70vh] w-80 overflow-y-auto rounded-lg border bg-background shadow-lg">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Buscando…
            </div>
          ) : !hasResults ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sin resultados para &quot;{query}&quot;
            </p>
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
                          <span className="block truncate">{item.label}</span>
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
