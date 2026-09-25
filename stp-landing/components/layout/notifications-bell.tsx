'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck } from 'lucide-react'
import type { AppNotification, NotificationType } from '@/lib/types'

const TYPE_LABELS: Record<NotificationType, string> = {
  task_assigned: 'Tarea asignada',
  quote_approved: 'Cotización aprobada',
  quote_rejected: 'Cotización rechazada',
  payment_received: 'Pago recibido',
}

const POLL_MS = 30_000

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `hace ${hr} h`
  const days = Math.floor(hr / 24)
  return `hace ${days} d`
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppNotification[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const refreshCount = useCallback(() => {
    fetch('/api/notifications/unread-count')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setCount(data.count))
      .catch(() => {})
  }, [])

  useEffect(() => {
    refreshCount()
    const interval = setInterval(refreshCount, POLL_MS)
    return () => clearInterval(interval)
  }, [refreshCount])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleToggle() {
    const next = !open
    setOpen(next)
    if (next) {
      setLoading(true)
      fetch('/api/notifications')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data && setItems(data.data))
        .finally(() => setLoading(false))
    }
  }

  async function handleSelect(n: AppNotification) {
    setOpen(false)
    if (!n.read) {
      setItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, read: true } : it)))
      setCount((c) => Math.max(0, c - 1))
      fetch(`/api/notifications/${n.id}/read`, { method: 'PATCH' }).catch(() => {})
    }
    if (n.link) router.push(n.link)
  }

  async function handleMarkAllRead(e: React.MouseEvent) {
    e.stopPropagation()
    setItems((prev) => prev.map((it) => ({ ...it, read: true })))
    setCount(0)
    fetch('/api/notifications/read-all', { method: 'PATCH' }).catch(() => {})
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="relative flex size-8 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Bell className="size-4" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 max-h-[70vh] w-80 overflow-y-auto rounded-lg border bg-background shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="text-sm font-medium">Notificaciones</p>
            {count > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <CheckCheck className="size-3.5" />
                Marcar todas como leídas
              </button>
            )}
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sin notificaciones</p>
          ) : (
            <div className="py-1">
              {items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleSelect(n)}
                  className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted ${
                    n.read ? '' : 'bg-primary/5'
                  }`}
                >
                  <span className="flex w-full items-center gap-1.5">
                    {!n.read && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                    <span className="flex-1 truncate font-medium">{n.title}</span>
                  </span>
                  {n.message && (
                    <span className="line-clamp-2 text-xs text-muted-foreground">{n.message}</span>
                  )}
                  <span className="text-[11px] text-muted-foreground">
                    {TYPE_LABELS[n.type]} · {timeAgo(n.createdAt)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
