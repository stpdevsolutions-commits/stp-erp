'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { addComment } from '@/lib/actions/tickets'
import type { TicketComment } from '@/lib/types'

const DATE_FMT = new Intl.DateTimeFormat('es-DO', { dateStyle: 'medium', timeStyle: 'short' })

export function CommentThread({
  ticketId,
  initialComments,
}: {
  ticketId: string
  initialComments: TicketComment[]
}) {
  const [comments, setComments] = useState(initialComments)
  const [body, setBody] = useState('')
  const [author, setAuthor] = useState('Pedro')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setSubmitting(true)
    setError(null)
    const result = await addComment(ticketId, body.trim(), author.trim() || undefined)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error ?? 'Error al comentar')
      return
    }
    // Optimista: lo agregamos localmente ya — revalidatePath refresca el
    // resto de la página en el próximo request, no hace falta esperarlo aquí.
    setComments((prev) => [
      ...prev,
      { id: crypto.randomUUID(), ticketId, body: body.trim(), author: author.trim() || 'Pedro', createdAt: new Date().toISOString() },
    ])
    setBody('')
  }

  return (
    <div className="space-y-3">
      {comments.length === 0 && (
        <p className="text-sm text-muted-foreground">Todavía no hay comentarios.</p>
      )}
      <ul className="space-y-3">
        {comments.map((c) => (
          <li key={c.id} className="border rounded-lg p-3">
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{c.author}</span>
              <span>{DATE_FMT.format(new Date(c.createdAt))}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm">{c.body}</p>
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} className="space-y-2 border-t pt-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Agregar un comentario..."
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
        />
        <div className="flex items-center justify-between gap-2">
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Tu nombre"
            className="h-8 w-32 rounded-md border border-input bg-transparent px-2 text-sm"
          />
          <Button type="submit" size="sm" disabled={submitting || !body.trim()}>
            {submitting ? 'Enviando...' : 'Comentar'}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </form>
    </div>
  )
}
