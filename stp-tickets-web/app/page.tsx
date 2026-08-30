import { getProjects, getTickets } from '@/lib/actions/tickets'
import { TicketsBoard } from '@/components/tickets/tickets-board'

export default async function Home() {
  const [projects, tickets] = await Promise.all([getProjects(), getTickets()])

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <TicketsBoard projects={projects} initialTickets={tickets} />
    </main>
  )
}
