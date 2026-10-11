/**
 * Avisos emergentes del ERP (confirmaciones, advertencias, errores y operaciones en curso).
 *
 * Es un almacén mínimo con suscripción: cualquier componente cliente llama a
 * `toast.success('Cliente creado')` y el `<Toaster />` montado en Providers los pinta.
 * Sin dependencias: el diseño (tokens, tema claro/oscuro, safe-area) vive en un solo sitio.
 */
export type ToastKind = 'success' | 'error' | 'warning' | 'info' | 'loading'

export type ToastItem = {
  id: number
  kind: ToastKind
  message: string
  description?: string
}

type Listener = (items: ToastItem[]) => void

let items: ToastItem[] = []
let nextId = 1
const listeners = new Set<Listener>()
const timers = new Map<number, ReturnType<typeof setTimeout>>()

// Los errores se quedan más tiempo: hay que poder leerlos y actuar.
const DURATION: Record<ToastKind, number> = {
  success: 3500,
  info: 4500,
  warning: 6000,
  error: 7000,
  loading: 0, // se queda hasta que se actualice o se descarte
}

function emit() {
  for (const l of listeners) l(items)
}

function dismiss(id: number) {
  const t = timers.get(id)
  if (t) clearTimeout(t)
  timers.delete(id)
  items = items.filter((i) => i.id !== id)
  emit()
}

function schedule(id: number, kind: ToastKind) {
  const ms = DURATION[kind]
  const prev = timers.get(id)
  if (prev) clearTimeout(prev)
  if (ms > 0) timers.set(id, setTimeout(() => dismiss(id), ms))
}

function push(kind: ToastKind, message: string, description?: string): number {
  // Un aviso idéntico ya visible no se apila (un doble clic no debe llenar la pantalla).
  const dup = items.find((i) => i.kind === kind && i.message === message)
  if (dup) {
    schedule(dup.id, kind)
    return dup.id
  }
  const id = nextId++
  // Máximo 4 a la vez: el más viejo se va.
  items = [...items, { id, kind, message, description }].slice(-4)
  schedule(id, kind)
  emit()
  return id
}

function update(id: number, kind: ToastKind, message: string, description?: string) {
  items = items.map((i) => (i.id === id ? { ...i, kind, message, description } : i))
  schedule(id, kind)
  emit()
}

export const toast = {
  success: (message: string, description?: string) => push('success', message, description),
  error: (message: string, description?: string) => push('error', message, description),
  warning: (message: string, description?: string) => push('warning', message, description),
  info: (message: string, description?: string) => push('info', message, description),
  /** Operación en curso; devuelve el id para cerrarla con `toast.done` o `toast.fail`. */
  loading: (message: string) => push('loading', message),
  done: (id: number, message: string) => update(id, 'success', message),
  fail: (id: number, message: string) => update(id, 'error', message),
  dismiss,
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  listener(items)
  return () => {
    listeners.delete(listener)
  }
}

export { dismiss as dismissToast }
