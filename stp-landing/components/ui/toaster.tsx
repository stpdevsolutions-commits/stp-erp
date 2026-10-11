'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react'
import { dismissToast, subscribe, type ToastItem, type ToastKind } from '@/lib/toast'
import { cn } from '@/lib/utils'

const STYLE: Record<ToastKind, { icon: typeof Info; tone: string }> = {
  success: { icon: CheckCircle2, tone: 'text-brand-green' },
  error: { icon: AlertCircle, tone: 'text-destructive' },
  warning: { icon: AlertTriangle, tone: 'text-amber-600 dark:text-amber-400' },
  info: { icon: Info, tone: 'text-primary' },
  loading: { icon: Loader2, tone: 'text-muted-foreground' },
}

/**
 * Pinta los avisos de `lib/toast`. En celular se ancla sobre la barra inferior (y su área
 * segura); en escritorio, arriba a la derecha bajo el header. Los errores se anuncian como
 * `alert` para lectores de pantalla y el resto como `status`.
 */
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])
  useEffect(() => subscribe(setItems), [])

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:inset-x-auto md:bottom-auto md:right-6 md:top-16 md:items-end md:px-0"
      aria-label="Avisos"
    >
      {items.map((t) => {
        const { icon: Icon, tone } = STYLE[t.kind]
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-popover px-4 py-3 text-popover-foreground shadow-lg animate-in fade-in slide-in-from-bottom-2 md:slide-in-from-right-4"
          >
            <Icon className={cn('mt-0.5 size-[18px] shrink-0', tone, t.kind === 'loading' && 'animate-spin')} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug">{t.message}</p>
              {t.description && (
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{t.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Cerrar aviso"
              className="-mr-1 -mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
