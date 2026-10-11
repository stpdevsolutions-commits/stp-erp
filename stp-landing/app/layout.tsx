import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { PwaRegister } from "@/components/pwa-register";

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
        <PwaRegister />
      </body>
    </html>
  );
}
