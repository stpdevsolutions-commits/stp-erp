import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vigía — STP Monitor',
  description: 'Infraestructura bajo control',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
