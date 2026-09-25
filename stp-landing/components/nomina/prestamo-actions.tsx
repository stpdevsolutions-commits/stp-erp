'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cancelCollaboratorLoan } from '@/lib/actions/payroll'
import type { CollaboratorLoan } from '@/lib/types'

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

export function PrestamoActions({ loan }: { loan: CollaboratorLoan }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  if (loan.status !== 'active') return null

  async function handleCancel() {
    setLoading(true)
    await cancelCollaboratorLoan(loan.id)
    setLoading(false)
    setOpen(false)
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setOpen(true)}>
        Anular
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Anular préstamo?</DialogTitle>
            <DialogDescription>
              Deja de descontarse de la nómina de {loan.collaborator?.firstName} {loan.collaborator?.lastName}.
              El saldo pendiente ({DOP.format(loan.balance)}) no se cobrará más automáticamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Volver</Button>
            <Button type="button" variant="destructive" onClick={handleCancel} disabled={loading}>
              {loading ? 'Anulando...' : 'Anular préstamo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
