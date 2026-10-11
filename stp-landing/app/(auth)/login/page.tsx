'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthShell } from '@/components/auth/auth-shell'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const loginSchema = z.object({
  email: z.string().email('Correo electrónico inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
})

const forgotSchema = z.object({
  email: z.string().email('Correo electrónico inválido'),
})

type LoginForm = z.infer<typeof loginSchema>
type ForgotForm = z.infer<typeof forgotSchema>

/** El backend a veces responde en inglés (class-validator); aquí se muestra en español. */
function translateAuthError(message?: string | string[]): string {
  const text = Array.isArray(message) ? message.join(' ') : (message ?? '')
  if (/password must be longer/i.test(text)) return 'La contraseña debe tener al menos 6 caracteres.'
  if (/email must be an email/i.test(text)) return 'Correo electrónico inválido.'
  if (/unauthorized|invalid credentials/i.test(text)) return 'Correo o contraseña incorrectos.'
  return text || 'Error al iniciar sesión'
}

export default function LoginPage() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotError, setForgotError] = useState<string | null>(null)

  // El callback de Google redirige a /login?error=... cuando la cuenta no está
  // autorizada; mostramos ese mensaje al usuario.
  // Se lee en un efecto (no con useSearchParams) para no tener que envolver la
  // página en <Suspense>; es un solo render extra, solo cuando hay error.
  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get('error')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (error) setServerError(error)
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const {
    register: registerForgot,
    handleSubmit: handleForgotSubmit,
    formState: { errors: forgotErrors, isSubmitting: isForgotSubmitting },
    reset: resetForgot,
  } = useForm<ForgotForm>({ resolver: zodResolver(forgotSchema) })

  async function onSubmit(data: LoginForm) {
    setServerError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const err = await res.json()
        setServerError(translateAuthError(err.message))
        return
      }

      window.location.assign('/dashboard')
    } catch {
      setServerError('Error de conexión. Intente de nuevo.')
    }
  }

  async function onForgotSubmit(data: ForgotForm) {
    setForgotError(null)
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email }),
      })
      setForgotSent(true)
    } catch {
      setForgotError('Error de conexión. Intente de nuevo.')
    }
  }

  function handleForgotClose(open: boolean) {
    setForgotOpen(open)
    if (!open) {
      setForgotSent(false)
      setForgotError(null)
      resetForgot()
    }
  }

  // El flujo OAuth de Google requiere navegación de página completa al dominio
  // público de la API (no un fetch): el navegador va a la API, esta redirige a
  // Google y vuelve al callback. Derivamos el host de la API del origen actual
  // (erp.stpsoluciones.com → api.stpsoluciones.com) para no hardcodear dominios.
  function handleGoogleLogin() {
    const apiBase = window.location.origin.replace('://erp.', '://api.')
    window.location.href = `${apiBase}/auth/google`
  }

  return (
    <>
      <AuthShell>
          <h1 className="text-2xl font-semibold tracking-tight">Iniciar sesión</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ingresa tus credenciales para acceder al sistema.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                placeholder="usuario@stp.com"
                autoComplete="email"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
                className="h-11 text-base sm:h-9 sm:text-sm"
                {...register('email')}
              />
              {errors.email && (
                <p id="email-error" className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Contraseña</Label>
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  className="h-11 pr-11 text-base sm:h-9 sm:pr-10 sm:text-sm"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>

            {serverError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{serverError}</span>
              </div>
            )}

            <Button type="submit" size="lg" className="h-11 w-full text-base sm:h-9 sm:text-sm" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {isSubmitting ? 'Iniciando sesión...' : 'Iniciar sesión'}
            </Button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">o</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-11 w-full text-base sm:h-9 sm:text-sm"
            onClick={handleGoogleLogin}
          >
            <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
              />
            </svg>
            Continuar con Google
          </Button>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} STP · Soluciones Técnicas Profesionales
          </p>
      </AuthShell>


      {/* Forgot password dialog */}
      <Dialog open={forgotOpen} onOpenChange={handleForgotClose}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Restablecer contraseña</DialogTitle>
            <DialogDescription>
              Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.
            </DialogDescription>
          </DialogHeader>

          {forgotSent ? (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground bg-muted rounded-md px-4 py-3">
                Si existe una cuenta con ese correo, recibirás un enlace en los próximos minutos. Revisa tu bandeja de entrada y spam.
              </p>
              <DialogFooter>
                <Button onClick={() => handleForgotClose(false)}>Cerrar</Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleForgotSubmit(onForgotSubmit)} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Correo electrónico</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="usuario@stp.com"
                  autoComplete="email"
                  {...registerForgot('email')}
                />
                {forgotErrors.email && (
                  <p className="text-sm text-destructive">{forgotErrors.email.message}</p>
                )}
              </div>

              {forgotError && (
                <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
                  {forgotError}
                </p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleForgotClose(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isForgotSubmitting}>
                  {isForgotSubmitting ? 'Enviando...' : 'Enviar enlace'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
