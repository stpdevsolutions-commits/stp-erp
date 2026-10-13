import { Suspense } from 'react'
import { Bandeja } from '@/components/mensajes/bandeja'

export const metadata = { title: 'Mensajes' }

export default function MensajesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mensajes</h1>
        <p className="hidden text-sm text-muted-foreground sm:block">
          WhatsApp de STP: conversaciones con clientes y clientes potenciales, con su etapa de seguimiento.
        </p>
      </div>
      <Suspense fallback={null}>
        <Bandeja />
      </Suspense>
    </div>
  )
}
