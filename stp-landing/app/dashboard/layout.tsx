import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Separator } from '@/components/ui/separator'
import { api } from '@/lib/api'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const token = cookieStore.get('stp-token')

  if (!token) {
    redirect('/login')
  }

  const me = await api.get<{ role: string }>('/users/me').catch(() => null)
  const role = me?.role ?? 'USER'

  return (
    <SidebarProvider>
      <AppSidebar role={role} />
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex h-14 items-center gap-2 border-b px-4 shrink-0">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm text-muted-foreground font-medium">STP ERP</span>
        </header>
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </SidebarProvider>
  )
}
