import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { getComments, getProjects, getTicket } from '@/lib/actions/tickets'
import { TicketActions } from '@/components/tickets/ticket-actions'
import { CommentThread } from '@/components/tickets/comment-thread'
import {
  TYPE_LABELS,
  STATUS_LABELS,
  PRIORITY_LABELS,
  PRIORITY_BADGE,
  STATUS_BADGE,
} from '@/components/tickets/labels'

const DATE_FMT = new Intl.DateTimeFormat('es-DO', { dateStyle: 'medium', timeStyle: 'short' })

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [ticket, comments, projects] = await Promise.all([
    getTicket(id),
    getComments(id),
    getProjects(),
  ])

  if (!ticket) notFound()

  const code = ticket.project?.code ? `${ticket.project.code}-${ticket.projectNumber}` : `#${ticket.number}`

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver a tickets
      </Link>

      <div className="border rounded-lg p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-sm text-muted-foreground">{code}</p>
            <h1 className="text-lg font-semibold">{ticket.title}</h1>
          </div>
          <TicketActions ticket={ticket} projects={projects} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{ticket.project?.name ?? 'Sin proyecto'}</Badge>
          <Badge variant="outline">{TYPE_LABELS[ticket.type]}</Badge>
          <Badge variant={PRIORITY_BADGE[ticket.priority]}>{PRIORITY_LABELS[ticket.priority]}</Badge>
          <Badge variant={STATUS_BADGE[ticket.status]}>{STATUS_LABELS[ticket.status]}</Badge>
        </div>

        {ticket.description && (
          <p className="whitespace-pre-wrap text-sm text-foreground/90">{ticket.description}</p>
        )}

        <div className="grid grid-cols-2 gap-3 border-t pt-3 text-xs text-muted-foreground sm:grid-cols-4">
          <div>
            <p className="font-medium text-foreground">Reportado por</p>
            <p>{ticket.reportedBy}</p>
          </div>
          <div>
            <p className="font-medium text-foreground">Asignado a</p>
            <p>{ticket.assignedTo ?? '—'}</p>
          </div>
          <div>
            <p className="font-medium text-foreground">Creado</p>
            <p>{DATE_FMT.format(new Date(ticket.createdAt))}</p>
          </div>
          <div>
            <p className="font-medium text-foreground">Actualizado</p>
            <p>{DATE_FMT.format(new Date(ticket.updatedAt))}</p>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold">Comentarios</h2>
        <CommentThread ticketId={ticket.id} initialComments={comments} />
      </div>
    </main>
  )
}
