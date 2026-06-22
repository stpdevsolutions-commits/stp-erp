'use client'

import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ExportCsvButton({ href, label = 'Exportar CSV' }: { href: string; label?: string }) {
  return (
    <Button variant="outline" size="sm" render={<a href={href} download />}>
      <Download className="size-4 mr-1.5" />
      {label}
    </Button>
  )
}
