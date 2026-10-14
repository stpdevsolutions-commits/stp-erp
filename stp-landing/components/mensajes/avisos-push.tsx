'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Estado = 'cargando' | 'no-soportado' | 'no-configurado' | 'bloqueado' | 'inactivo' | 'activo'

/** Clave pública VAPID (base64url) → bytes, el formato que pide pushManager.subscribe. */
function claveABytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function soportado(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
}

/** iPhone/iPad: Web Push solo existe con la app instalada en la pantalla de inicio (iOS 16.4+). */
function esIos(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1)
}

async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`/api/push/${path}`, { ...init, headers: { 'Content-Type': 'application/json' }, cache: 'no-store' })
}

/**
 * Activa o desactiva los avisos push de la bandeja en ESTE dispositivo (ERP-58). El permiso del
 * navegador se pide solo al pulsar el botón, nunca al cargar la pantalla.
 */
export function AvisosPush() {
  const [estado, setEstado] = useState<Estado>('cargando')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const evaluar = useCallback(async () => {
    if (!soportado()) {
      setEstado('no-soportado')
      return
    }
    if (Notification.permission === 'denied') {
      setEstado('bloqueado')
      return
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      const sub = await reg?.pushManager.getSubscription()
      setEstado(sub && Notification.permission === 'granted' ? 'activo' : 'inactivo')
    } catch {
      setEstado('inactivo')
    }
  }, [])

  useEffect(() => {
    // Evaluar toca APIs del navegador: se difiere para no hidratar distinto en servidor y cliente.
    const t = setTimeout(() => void evaluar(), 0)
    return () => clearTimeout(t)
  }, [evaluar])

  async function activar() {
    setOcupado(true)
    setError(null)
    try {
      const clave = await api('public-key')
      if (clave.status === 404) {
        setEstado('no-configurado')
        return
      }
      if (!clave.ok) throw new Error('No se pudo consultar la configuración de avisos.')
      const { publicKey } = (await clave.json()) as { publicKey: string }

      const permiso = await Notification.requestPermission()
      if (permiso !== 'granted') {
        setEstado(permiso === 'denied' ? 'bloqueado' : 'inactivo')
        return
      }
      const reg = (await navigator.serviceWorker.getRegistration('/sw.js')) ?? (await navigator.serviceWorker.register('/sw.js'))
      await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(publicKey) }))
      const res = await api('subscribe', { method: 'POST', body: JSON.stringify(sub.toJSON()) })
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(msg.message ?? 'No se pudo registrar este dispositivo.')
      }
      setEstado('activo')
    } catch (e) {
      setError((e as Error).message || 'No se pudieron activar los avisos.')
    } finally {
      setOcupado(false)
    }
  }

  async function desactivar() {
    setOcupado(true)
    setError(null)
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        const res = await api('subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) })
        if (!res.ok) throw new Error('No se pudo desactivar en el servidor.')
        await sub.unsubscribe()
      }
      setEstado('inactivo')
    } catch (e) {
      setError((e as Error).message || 'No se pudieron desactivar los avisos.')
    } finally {
      setOcupado(false)
    }
  }

  if (estado === 'cargando' || estado === 'no-configurado') return null

  let contenido: React.ReactNode
  if (estado === 'no-soportado') {
    contenido = (
      <span className="text-xs text-muted-foreground">
        {esIos()
          ? 'Para recibir avisos en el iPhone, instala la app: Compartir → "Añadir a pantalla de inicio" y ábrela desde ahí (iOS 16.4 o superior).'
          : 'Este navegador no admite avisos push.'}
      </span>
    )
  } else if (estado === 'bloqueado') {
    contenido = (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <BellOff className="size-3.5" aria-hidden /> Avisos bloqueados: permite las notificaciones de este sitio en los ajustes del navegador.
      </span>
    )
  } else if (estado === 'activo') {
    contenido = (
      <>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Bell className="size-3.5 text-primary" aria-hidden /> Avisos activados en este dispositivo
        </span>
        <Button variant="ghost" size="xs" onClick={() => void desactivar()} disabled={ocupado}>
          Desactivar
        </Button>
      </>
    )
  } else {
    contenido = (
      <Button variant="outline" size="xs" onClick={() => void activar()} disabled={ocupado}>
        <Bell aria-hidden /> Activar avisos en este dispositivo
      </Button>
    )
  }

  return (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
      {contenido}
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  )
}
