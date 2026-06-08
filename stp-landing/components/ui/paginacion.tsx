'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export function Paginacion({
  total,
  page,
  limit,
}: {
  total: number
  page: number
  limit: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const totalPages = Math.ceil(total / limit)

  if (totalPages <= 1) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        {total} {total === 1 ? 'resultado' : 'resultados'}
      </p>
    )
  }

  function goTo(p: number) {
    const sp = new URLSearchParams(params.toString())
    sp.set('page', String(p))
    router.push(`${pathname}?${sp.toString()}`)
  }

  return (
    <div className="flex items-center justify-between py-2">
      <p className="text-sm text-muted-foreground">
        {total} resultados · página {page} de {totalPages}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => goTo(page - 1)}
        >
          <ChevronLeft className="size-4" />
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => goTo(page + 1)}
        >
          Siguiente
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
