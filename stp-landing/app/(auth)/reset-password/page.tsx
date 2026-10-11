'use client'

import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthShell } from '@/components/auth/auth-shell'

const schema = z.object({
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  confirm: z.string().min(1, 'Confirma la contraseña'),
}).refine((d) => d.password === d.confirm, {
  message: 'Las contraseñas no coinciden',
  path: ['confirm'],
})

type FormValues = z.infer<typeof schema>

function ResetForm() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormValues) {
    if (!token) {
      setServerError('Token inválido o expirado.')
      return
    }
    setServerError(null)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: data.password }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string }
        setServerError(err.message ?? 'Error al restablecer la contraseña.')
        return
      }
      setSuccess(true)
      setTimeout(() => router.push('/login'), 3000)
    } catch {
      setServerError('Error de conexión. Intente de nuevo.')
    }
  }

  if (!token) {
    return (
      <p className="text-sm text-destructive text-center">
        El enlace de restablecimiento no es válido o ha expirado. Solicita uno nuevo desde la pantalla de inicio de sesión.
      </p>
    )
  }

  if (success) {
    return (
      <p className="text-sm text-muted-foreground bg-muted rounded-md px-4 py-3 text-center">
        ¡Contraseña actualizada! Redirigiendo al inicio de sesión...
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">Nueva contraseña</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            className="h-11 pr-11 text-base sm:h-9 sm:pr-10 sm:text-sm"
            {...register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm">Confirmar contraseña</Label>
        <div className="relative">
          <Input
            id="confirm"
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            className="h-11 pr-11 text-base sm:h-9 sm:pr-10 sm:text-sm"
            {...register('confirm')}
          />
          <button
            type="button"
            onClick={() => setShowConfirm((v) => !v)}
            className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {errors.confirm && <p className="text-sm text-destructive">{errors.confirm.message}</p>}
      </div>

      {serverError && (
        <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
          {serverError}
        </p>
      )}

      <Button type="submit" size="lg" className="h-11 w-full text-base sm:h-9 sm:text-sm" disabled={isSubmitting}>
        {isSubmitting ? 'Guardando...' : 'Restablecer contraseña'}
      </Button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold tracking-tight">Nueva contraseña</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Ingresa tu nueva contraseña para restablecer el acceso.
      </p>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando...</p>}>
        <ResetForm />
      </Suspense>
    </AuthShell>
  )
}
