'use client'

import { VersionGuard } from './version-guard'
import { Toaster } from '@/components/ui/toaster'
// Efecto global: mensajes de Zod en español en todos los formularios.
import '@/lib/zod-es'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <VersionGuard />
      <Toaster />
    </>
  )
}
