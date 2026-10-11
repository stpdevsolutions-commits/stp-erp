import Image from 'next/image'
import { Blueprint } from '@/components/brand/blueprint'

/**
 * Marco de las pantallas de acceso (login, restablecer contraseña): zona de marca con el
 * plano de STP y, al lado, el formulario. En móvil la marca pasa a una banda superior
 * compacta para que el formulario quede a la vista sin perder la identidad.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* Zona de marca: en escritorio ocupa la mitad; en móvil queda como banda compacta */}
      <aside className="relative isolate flex flex-col justify-between overflow-hidden px-6 pb-8 pt-[max(1.5rem,env(safe-area-inset-top))] text-white lg:px-14 lg:py-12">
        <Blueprint />
        <div className="relative z-10 flex items-center gap-3">
          <span className="inline-flex items-center justify-center rounded-lg bg-white p-2 shadow-sm">
            <Image
              src="/logo-stp.png"
              alt="STP — Soluciones Técnicas Profesionales"
              width={242}
              height={151}
              className="h-9 w-auto lg:h-11"
              priority
            />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-wide">STP ERP</p>
            <p className="text-xs text-white/70">Soluciones Técnicas Profesionales</p>
          </div>
        </div>
        <div className="relative z-10 hidden max-w-md lg:block">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-brand-green-soft">
            Construcción · Instalaciones · Ingeniería
          </p>
          <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-tight">
            Tus proyectos, costos y obras en un solo lugar.
          </h2>
        </div>
      </aside>

      <main className="flex items-start justify-center bg-background px-6 py-8 pb-[max(2.5rem,env(safe-area-inset-bottom))] lg:items-center lg:py-10">
        <div className="w-full max-w-sm">
          {children}
        </div>
      </main>
    </div>
  )
}
