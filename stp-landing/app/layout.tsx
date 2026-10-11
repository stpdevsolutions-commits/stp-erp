import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { PwaRegister } from "@/components/pwa-register";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "STP ERP",
  description: "Sistema de gestión interno de Soluciones Técnicas Profesionales",
  // PWA (STP Facturas): en iPhone, "Añadir a pantalla de inicio" usa esto para el nombre y
  // abrir sin la barra de Safari. El ícono sale de app/apple-icon.png.
  appleWebApp: { capable: true, title: "STP Facturas", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0D3773",
  // Que la pantalla use todo el alto en iPhone con muesca.
  viewportFit: "cover",
  // Con el teclado virtual abierto, el área de la página se encoge (Android/Chrome) en vez de
  // quedar tapada: así los botones de los diálogos y formularios siguen alcanzables.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
        <PwaRegister />
      </body>
    </html>
  );
}
