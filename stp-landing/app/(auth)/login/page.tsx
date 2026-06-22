'use client'

import { useState } from 'react'
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
