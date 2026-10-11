import { getProjects, getTickets } from '@/lib/actions/tickets'
import { TicketsBoard } from '@/components/tickets/tickets-board'

export const dynamic = 'force-dynamic'

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const sp = await searchParams
  const [projects, tickets] = await Promise.all([getProjects(), getTickets()])
  // Los accesos de Inicio y del menú llegan con ?project=, ?status= y/o ?sort=; la clave remonta el
  // tablero para que cada enlace aplique sus filtros aunque ya se esté en esta pantalla.
  const urlFilters = { project: sp.project, status: sp.status, sort: sp.sort, all: sp.all }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
      <TicketsBoard
        key={`${sp.project ?? ''}|${sp.status ?? ''}|${sp.sort ?? ''}|${sp.all ?? ''}`}
        projects={projects}
        initialTickets={tickets}
        urlFilters={urlFilters}
      />
    </main>
  )
}
