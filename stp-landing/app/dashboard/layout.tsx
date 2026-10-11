import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { MobileNav } from '@/components/layout/mobile-nav'
import { VisitTracker } from '@/components/layout/visit-tracker'
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
  let modules: Record<string, string> | undefined
  try {
    const me = await api.get<{
      role: string
      firstName: string
      lastName: string
      modules?: Record<string, string>
    }>('/users/me')
    role = me.role
    modules = me.modules
    user = { firstName: me.firstName, lastName: me.lastName, role: me.role }
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      redirect('/api/auth/logout')
    }
    // otros errores (red caída, etc.) → seguir con rol 'user'
  }

  return (
    <SidebarProvider>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Saltar al contenido
      </a>
      <VisitTracker />
      <AppSidebar role={role} user={user} modules={modules} />
      <div className="flex flex-col flex-1 min-w-0">
        <AppHeader user={user} modules={modules} />
        <main id="contenido" className="flex-1 overflow-auto p-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:p-6 md:pb-6">
          {children}
        </main>
      </div>
      <MobileNav role={role} modules={modules} />
    </SidebarProvider>
  )
}
