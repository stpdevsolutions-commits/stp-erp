'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { updateDefaultTerms } from '@/lib/actions/settings'

export function TermsForm({ defaultTerms }: { defaultTerms: string }) {
  const [terms, setTerms] = useState(defaultTerms)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setSuccess(false)
    setError(null)
    const result = await updateDefaultTerms(terms)
    setSaving(false)
    if (!result.ok) {
      setError(result.error ?? 'Error al guardar')
      return
    }
    setSuccess(true)
  }

  return (
    <div className="space-y-3">
      <textarea
        value={terms}
        onChange={(e) => { setTerms(e.target.value); setSuccess(false) }}
        rows={6}
        placeholder="Ej: El pago se realiza 50% al inicio y 50% al finalizar. Cotización válida por 30 días..."
        className="w-full resize-y text-sm rounded-md border border-input bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <p className="text-xs text-muted-foreground">
        Este texto se pre-llenará automáticamente en el campo de Términos al crear una nueva cotización.
      </p>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
      )}
      {success && (
        <p className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 rounded-md px-3 py-2">Términos guardados correctamente.</p>
      )}

      <Button size="sm" disabled={saving} onClick={handleSave}>
        {saving ? 'Guardando...' : 'Guardar términos'}
      </Button>
    </div>
  )
}
