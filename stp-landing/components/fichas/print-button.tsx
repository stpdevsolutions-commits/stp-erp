'use client'

import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'

export function PrintButton({ fichaId, code }: { fichaId: string; code: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => window.open(`/api/fichas/${fichaId}/pdf`, '_blank', 'noopener')}
    >
      <Printer className="size-4 mr-2" />
      Imprimir / PDF
    </Button>
  )
}
