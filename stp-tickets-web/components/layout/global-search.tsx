'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, KanbanSquare } from 'lucide-react'
import { NAV } from '@/lib/nav'
import { cn } from '@/lib/utils'

export type SearchableTicket = { id: string; code: string; title: string; project: string | null }

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const MODULES = NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })))

/**
 * Búsqueda global: secciones ("Ir a") y tickets por código o título. Los tickets llegan ya cargados
 * desde el servidor, así que responde al instante y sin llamadas extra. Ctrl/⌘+K la abre.
 */
export function GlobalSearch({ tickets }: { tickets: SearchableTicket[] }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  // En celular el campo no cabe en la barra superior: una lupa lo abre a todo el ancho.
  const [mobileOpen, setMobileOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setMobileOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setMobileOpen(true)
        setOpen(true)
        inputRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const q = norm(query.trim())
  const modules = q
    ? MODULES.filter((m) => norm(`${m.label} ${m.description ?? ''} ${m.group ?? ''}`).includes(q)).slice(0, 4)
    : []
  const found = q
    ? tickets.filter((t) => norm(`${t.code} ${t.title} ${t.project ?? ''}`).includes(q)).slice(0, 8)
    : []

  function go(href: string) {
    setOpen(false)
    setMobileOpen(false)
    setQuery('')
    router.push(href)
  }

  const showDropdown = open && q.length >= 1

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Buscar"
        onClick={() => {
          setMobileOpen(true)
          setOpen(true)
          setTimeout(() => inputRef.current?.focus(), 0)
        }}
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground max-md:size-10 sm:hidden"
      >
        <Search className="size-4" />
      </button>

      <div
        className={cn(
          mobileOpen ? 'fixed inset-x-0 top-0 z-50 flex items-center gap-2 border-b bg-background p-2' : 'hidden',
          'sm:static sm:z-auto sm:flex sm:border-0 sm:bg-transparent sm:p-0',
        )}
      >
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground max-md:top-3.5" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setOpen(false)
                setMobileOpen(false)
                inputRef.current?.blur()
              }
            }}
            placeholder="Buscar o ir a… (Ctrl+K)"
            className="w-full rounded-md border bg-muted/50 py-1.5 pl-8 pr-7 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring max-md:py-2.5 sm:text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-2 text-muted-foreground hover:text-foreground max-md:top-3"
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
        <div className="absolute right-0 top-full z-50 mt-1.5 max-h-[70vh] w-[30rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border bg-popover shadow-lg max-sm:fixed max-sm:inset-x-2 max-sm:top-14 max-sm:mt-0 max-sm:w-auto max-sm:max-w-none">
          {modules.length > 0 && (
            <div className="border-b px-1.5 py-1.5">
              <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Ir a</p>
              {modules.map((m) => (
                <button
                  key={m.href}
                  type="button"
                  onClick={() => go(m.href)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted max-md:py-2.5"
                >
                  <m.icon className="size-3.5 shrink-0 text-primary" />
                  <span className="truncate">{m.label}</span>
                </button>
              ))}
            </div>
          )}
          {found.length > 0 && (
            <div className="px-1.5 py-1.5">
              <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Tickets</p>
              {found.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => go(`/tickets/${t.id}`)}
                  className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted max-md:py-2.5"
                >
                  <KanbanSquare className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2">{t.title}</span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {t.code}
                      {t.project ? ` · ${t.project}` : ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {modules.length === 0 && found.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">Sin resultados para &quot;{query}&quot;</p>
          )}
        </div>
      )}
    </div>
  )
}
