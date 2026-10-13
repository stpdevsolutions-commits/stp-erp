'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MessageSquare, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import {
  contactTitle,
  formatListTime,
  mFetch,
  type MessagingSummary,
  type WaAgent,
  type WaContactView,
} from '@/lib/messaging'
import { STAGE_LABELS } from '@/lib/messaging'
import { Hilo } from './hilo'
import { Tablero } from './tablero'

type Filter = 'queue' | 'mine' | 'waiting' | 'all'

const POLL_MS = 5000

export function Bandeja() {
  const router = useRouter()
  const params = useSearchParams()
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [contacts, setContacts] = useState<WaContactView[]>([])
  const [summary, setSummary] = useState<MessagingSummary | null>(null)
  const [agents, setAgents] = useState<WaAgent[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(params.get('c'))
  const [extra, setExtra] = useState<WaContactView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [view, setView] = useState<'lista' | 'tablero'>('lista')
  const seq = useRef(0)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    const mine = ++seq.current
    try {
      const q = new URLSearchParams({ filter })
      if (debounced) q.set('search', debounced)
      const [list, sum] = await Promise.all([
        mFetch<{ data: WaContactView[] }>(`/contacts?${q}`),
        mFetch<MessagingSummary>('/summary'),
      ])
      if (mine !== seq.current) return
      setContacts(list.data)
      setSummary(sum)
      setError(null)
    } catch (e) {
      if (mine === seq.current) setError((e as Error).message)
    } finally {
      if (mine === seq.current) setLoaded(true)
    }
  }, [filter, debounced])

  useEffect(() => {
    void load()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    mFetch<WaAgent[]>('/agents').then(setAgents).catch(() => {})
  }, [])

  // Conversación abierta por enlace (notificación, Telegram) que no está en el filtro actual.
  useEffect(() => {
    if (!selectedId || contacts.some((c) => c.id === selectedId)) {
      setExtra(null)
      return
    }
    mFetch<WaContactView>(`/contacts/${selectedId}`).then(setExtra).catch(() => setExtra(null))
  }, [selectedId, contacts])

  const selected = useMemo(
    () => contacts.find((c) => c.id === selectedId) ?? (extra?.id === selectedId ? extra : null),
    [contacts, extra, selectedId],
  )

  const select = (id: string | null) => {
    setSelectedId(id)
    router.replace(id ? `?c=${id}` : '?', { scroll: false })
  }

  const tabs: { key: Filter; label: string; count?: number }[] = [
    { key: 'all', label: 'Todas' },
    { key: 'queue', label: 'Sin dueño', count: summary?.queue },
    { key: 'mine', label: 'Mías', count: summary?.mine },
    { key: 'waiting', label: 'Esperan', count: summary?.waiting },
  ]

  return (
    <div className="flex h-[calc(100dvh-10.25rem)] min-h-[26rem] flex-col overflow-hidden rounded-xl border bg-card md:h-[calc(100dvh-10.5rem)]">
      <div className={cn('flex items-center gap-1 border-b px-3 py-1.5', selectedId && view === 'lista' && 'max-md:hidden')}>
        {(['lista', 'tablero'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors max-md:py-2',
              view === v ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {v}
          </button>
        ))}
      </div>
      {view === 'tablero' ? (
        <div className="min-h-0 flex-1">
          <Tablero
            contacts={contacts}
            onOpen={(id) => {
              select(id)
              setView('lista')
            }}
          />
        </div>
      ) : (
    <div className="flex min-h-0 flex-1">
      {/* Lista de conversaciones */}
      <aside className={cn('flex w-full flex-col border-r md:w-80 md:shrink-0', selectedId && 'hidden md:flex')}>
        <div className="space-y-2 border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nombre o número"
              className="pl-8"
              aria-label="Buscar conversaciones"
            />
          </div>
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filtro de conversaciones">
            {tabs.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={filter === t.key}
                onClick={() => setFilter(t.key)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors max-md:py-2',
                  filter === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
                {t.count ? <span className="tabular-nums opacity-80">{t.count}</span> : null}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {error ? (
            <div className="m-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
          ) : !loaded ? (
            <p className="p-4 text-sm text-muted-foreground">Cargando…</p>
          ) : contacts.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              filtered={!!debounced || filter !== 'all'}
              title="Sin conversaciones"
              hint="Cuando alguien escriba al WhatsApp de STP, aparecerá aquí."
            />
          ) : (
            <ul>
              {contacts.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => select(c.id)}
                    className={cn(
                      'flex w-full flex-col gap-1 border-b px-3 py-3 text-left transition-colors hover:bg-muted/60',
                      c.id === selectedId && 'bg-muted',
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn('truncate text-sm', c.unreadCount > 0 ? 'font-semibold' : 'font-medium')}>
                        {contactTitle(c)}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatListTime(c.lastMessageAt)}</span>
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted-foreground">{c.lastMessagePreview ?? 'Sin mensajes'}</span>
                      {c.unreadCount > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[0.7rem] font-semibold text-primary-foreground tabular-nums">
                          {c.unreadCount}
                        </span>
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="text-[0.65rem]">{STAGE_LABELS[c.stage]}</Badge>
                      {c.awaitingReply && <Badge variant="outline" className="text-[0.65rem]">Esperando respuesta</Badge>}
                      <span className="text-[0.7rem] text-muted-foreground">{c.assignedTo ? c.assignedTo.name : 'Sin dueño'}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Conversación */}
      <section className={cn('min-w-0 flex-1', !selectedId && 'hidden md:block')}>
        {selected ? (
          <Hilo key={selected.id} contact={selected} agents={agents} onChanged={load} onBack={() => select(null)} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={MessageSquare}
              title={selectedId ? 'Cargando conversación…' : 'Elige una conversación'}
              hint={selectedId ? undefined : 'Aquí verás el hilo, la ficha del cliente potencial y podrás responder.'}
            />
          </div>
        )}
      </section>
    </div>
      )}
    </div>
  )
}
