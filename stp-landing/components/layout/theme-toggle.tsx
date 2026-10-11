'use client'

import { Moon, Sun } from 'lucide-react'
import { THEME_KEY } from '@/lib/theme'

/**
 * Alterna claro/oscuro. Los dos íconos están siempre en el DOM y los muestra el CSS
 * según la clase `dark` de <html>, así no hay diferencia entre servidor y cliente.
 */
export function ThemeToggle() {
  function toggle() {
    const next = !document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem(THEME_KEY, next ? 'dark' : 'light')
    } catch {
      /* sin almacenamiento: el cambio vale solo para esta visita */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Cambiar entre tema claro y oscuro"
      title="Cambiar tema"
      className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Moon className="size-4 dark:hidden" />
      <Sun className="hidden size-4 dark:block" />
    </button>
  )
}
