import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/toaster";
import { AppSidebar, type SidebarProject } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { getProjects, getTickets } from "@/lib/actions/tickets";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { isOpen, ticketCode } from "@/lib/ticket-code";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "STP Tickets",
  description: "Bugs, cambios y mejoras de todos los proyectos de STP",
};

export const viewport: Viewport = {
  themeColor: "#0D3773",
  // Que la pantalla use todo el alto en iPhone con muesca.
  viewportFit: "cover",
  // Con el teclado virtual abierto el área de la página se encoge en vez de quedar tapada.
  interactiveWidget: "resizes-content",
};

// El menú lleva datos vivos (proyectos y conteos): nada de esto puede quedar en caché.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [projects, tickets] = await Promise.all([getProjects(), getTickets()]);

  const byProject = new Map(projects.map((p) => [p.id, p]));
  const sidebarProjects: SidebarProject[] = projects
    .map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      open: tickets.filter((t) => t.projectId === p.id && isOpen(t)).length,
    }))
    .sort((a, b) => b.open - a.open || a.code.localeCompare(b.code));

  const searchable = tickets.map((t) => ({
    id: t.id,
    code: ticketCode(t, t.projectId ? byProject.get(t.projectId) : undefined),
    title: t.title,
    project: t.projectId ? (byProject.get(t.projectId)?.name ?? null) : null,
  }));

  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full bg-background text-foreground">
        <SidebarProvider>
          <a
            href="#contenido"
            className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
          >
            Saltar al contenido
          </a>
          <AppSidebar projects={sidebarProjects} />
          <div className="flex min-h-svh min-w-0 flex-1 flex-col">
            <AppHeader tickets={searchable} />
            <div id="contenido" className="flex flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
              {children}
            </div>
          </div>
          <MobileNav />
        </SidebarProvider>
        <Toaster />
      </body>
    </html>
  );
}
