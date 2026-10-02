'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { VersionGuard } from './version-guard'
// Efecto global: mensajes de Zod en español en todos los formularios.
import '@/lib/zod-es'

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={client}>
      {children}
      <VersionGuard />
    </QueryClientProvider>
  )
}
