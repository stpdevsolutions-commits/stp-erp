'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FolderPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { convertQuoteToProject } from '@/lib/actions/quotes'

export function ConvertToProjectButton({ quoteId }: { quoteId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConvert() {
    setLoading(true)
    setError(null)
    const result = await convertQuoteToProject(quoteId)
    setLoading(false)
    if (!result.ok) {
      setError(result.error ?? 'Error al convertir')
      return
    }
    if (result.projectId) {
      router.push(`/dashboard/proyectos/${result.projectId}`)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={handleConvert} disabled={loading}>
        <FolderPlus className="size-4 mr-1.5" />
        {loading ? 'Convirtiendo...' : 'Convertir a Proyecto'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
