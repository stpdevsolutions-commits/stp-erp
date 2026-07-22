import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="space-y-2">
        <p className="text-5xl font-bold tracking-tight">404</p>
        <h1 className="text-xl font-semibold">Página no encontrada</h1>
        <p className="text-muted-foreground text-sm max-w-md">
          La página que buscas no existe o fue movida.
        </p>
      </div>
      <Link href="/dashboard" className={buttonVariants()}>
        Volver al inicio
      </Link>
    </div>
  )
}
