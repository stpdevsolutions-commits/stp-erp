import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { api, UnauthorizedError } from '@/lib/api'

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

  let role = 'user'
  let user: { firstName: string; lastName: string; role: string } | undefined
  try {
    const me = await api.get<{ role: string; firstName: string; lastName: string }>('/users/me')
    role = me.role
    user = { firstName: me.firstName, lastName: me.lastName, role: me.role }
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      redirect('/api/auth/logout')
    }
    // otros errores (red caída, etc.) → seguir con rol 'user'
  }

  return (
    <SidebarProvider>
      <AppSidebar role={role} user={user} />
      <div className="flex flex-col flex-1 min-w-0">
        <AppHeader user={user} />
        <main className="flex-1 overflow-auto p-4 sm:p-6">
          {children}
        </main>
      </div>
    </SidebarProvider>
  )
}
