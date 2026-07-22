'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

export default function LoginPage() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotError, setForgotError] = useState<string | null>(null)

  // El callback de Google redirige a /login?error=... cuando la cuenta no está
  // autorizada; mostramos ese mensaje al usuario.
  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get('error')
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
        setServerError(err.message ?? 'Error al iniciar sesión')
        return
      }

      window.location.href = '/dashboard'
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
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="size-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
              STP
            </div>
            <span className="font-semibold text-sm text-muted-foreground">Soluciones Técnicas Profesionales</span>
          </div>
          <CardTitle className="text-2xl">Iniciar sesión</CardTitle>
          <CardDescription>Ingresa tus credenciales para acceder al sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@stp.com"
                autoComplete="email"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Contraseña</Label>
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="pr-10"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>

            {serverError && (
              <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
                {serverError}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Iniciando sesión...' : 'Iniciar sesión'}
            </Button>
          </form>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">o</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
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
        </CardContent>
      </Card>

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
    </div>
  )
}
