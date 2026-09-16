'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Project } from '@/lib/types'
import { EtapaDialog } from './etapa-dialog'

export function NuevaEtapaDialog({
  projects,
  variant = 'default',
}: {
  projects: Project[]
  variant?: 'default' | 'outline'
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Nueva etapa
      </Button>
      <EtapaDialog projects={projects} open={open} onOpenChange={setOpen} />
    </>
  )
}
