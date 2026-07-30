'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createMaterialCategory } from '@/lib/actions/costs'
import type { MaterialCategory } from '@/lib/types'

const schema = z.object({
  code: z.string().min(1, 'Requerido').max(30),
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  parentId: z.string().optional(),
  description: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function NuevaCategoriaDialog({ categories }: { categories: MaterialCategory[] }) {
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { parentId: '' },
  })

  async function onSubmit(data: FormValues) {
    setServerError(null)
    const result = await createMaterialCategory({
      code: data.code,
      name: data.name,
      parentId: data.parentId || undefined,
      description: data.description || undefined,
    })
    if (!result.ok) {
      setServerError(result.error ?? 'Error desconocido')
      return
    }
    reset()
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) {
          reset()
          setServerError(null)
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4 mr-1" />
        Nueva categoría
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva categoría</DialogTitle>
          <DialogDescription>
            El código ordena el catálogo y es la base de la futura biblioteca de partidas.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="code">
                Código <span className="text-destructive">*</span>
              </Label>
              <Input id="code" placeholder="0201" {...register('code')} />
              {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="name">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input id="name" placeholder="Canalización" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="col-span-full space-y-1.5">
              <Label>Pertenece a</Label>
              <Select
                value={watch('parentId') || '__none__'}
                onValueChange={(v) => setValue('parentId', v === '__none__' ? '' : (v ?? ''))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Ninguna (categoría raíz)</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-full space-y-1.5">
              <Label htmlFor="description">Descripción</Label>
              <Input id="description" {...register('description')} />
            </div>
          </div>

          {serverError && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
              {serverError}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Crear categoría'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
