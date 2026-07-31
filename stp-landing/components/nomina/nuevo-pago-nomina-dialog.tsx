'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { PagoNominaForm } from './pago-nomina-form'
import { createPayrollEntry, type PayrollInput } from '@/lib/actions/payroll'
import type { Collaborator, Project } from '@/lib/types'

export function NuevoPagoNominaDialog({
  collaborators,
  projects,
}: {
  collaborators: Collaborator[]
  projects: Project[]
}) {
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  // Remonta el formulario al cerrar para que el siguiente pago empiece limpio.
  const [formKey, setFormKey] = useState(0)

  async function onSubmit(input: PayrollInput) {
    setServerError(null)
    const result = await createPayrollEntry(input)
    if (!result.ok) {
      setServerError(result.error ?? 'Error desconocido')
      return
    }
    setFormKey((k) => k + 1)
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) {
          setServerError(null)
          setFormKey((k) => k + 1)
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4 mr-1" />
        Registrar pago
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar pago de nómina</DialogTitle>
          <DialogDescription>
            Pago a un colaborador por el período trabajado. El bruto y el neto los calcula el
            sistema.
          </DialogDescription>
        </DialogHeader>

        {collaborators.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No hay colaboradores activos. Da de alta al personal en Colaboradores antes de
            registrar pagos.
          </p>
        ) : (
          <PagoNominaForm
            key={formKey}
            collaborators={collaborators}
            projects={projects}
            onSubmit={onSubmit}
            onCancel={() => setOpen(false)}
            serverError={serverError}
            submitLabel="Registrar pago"
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
