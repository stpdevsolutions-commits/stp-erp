'use client'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Download, FileText, Image } from 'lucide-react'
import type { Task, Expense, Payment, FileUpload, PaginatedResponse } from '@/lib/types'

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

const TASK_STATUS: Record<Task['status'], string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  review: 'En revisión',
  done: 'Completada',
  cancelled: 'Cancelada',
}
const TASK_STATUS_VARIANT: Record<Task['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  in_progress: 'default',
  review: 'outline',
  done: 'outline',
  cancelled: 'destructive',
}
const TASK_PRIORITY: Record<Task['priority'], string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
}

const EXPENSE_CAT: Record<string, string> = {
  materials: 'Materiales',
  labor: 'Mano de obra',
  equipment: 'Equipos',
  subcontract: 'Subcontrato',
  travel: 'Viáticos',
  other: 'Otros',
}

const PAYMENT_METHOD: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  check: 'Cheque',
  card: 'Tarjeta',
  other: 'Otro',
}
const PAYMENT_STATUS: Record<string, string> = {
  pending: 'Pendiente',
  completed: 'Completado',
  failed: 'Fallido',
  refunded: 'Reembolsado',
}
const PAYMENT_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  completed: 'default',
  failed: 'destructive',
  refunded: 'outline',
}

const FILE_CONTEXT: Record<string, string> = {
  'client-profile': 'Perfil',
  'project-photos': 'Fotos',
  'project-documents': 'Documentos',
  'project-expenses': 'Comprobantes',
  'project-quotes': 'Cotizaciones',
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export function ProjectDetailTabs({
  tasks,
  expenses,
  payments,
  files,
}: {
  tasks: PaginatedResponse<Task>
  expenses: PaginatedResponse<Expense>
  payments: PaginatedResponse<Payment>
  files: PaginatedResponse<FileUpload>
}) {
  const totalExpenses = expenses.data.reduce((s, e) => s + (e.amount ?? 0), 0)
  const totalPayments = payments.data
    .filter((p) => p.status === 'completed')
    .reduce((s, p) => s + (p.amount ?? 0), 0)

  return (
    <Tabs defaultValue="tareas">
      <div className="overflow-x-auto">
      <TabsList>
        <TabsTrigger value="tareas">
          Tareas <span className="ml-1 text-xs opacity-60">({tasks.total})</span>
        </TabsTrigger>
        <TabsTrigger value="gastos">
          Gastos <span className="ml-1 text-xs opacity-60">({expenses.total})</span>
        </TabsTrigger>
        <TabsTrigger value="pagos">
          Pagos <span className="ml-1 text-xs opacity-60">({payments.total})</span>
        </TabsTrigger>
        <TabsTrigger value="archivos">
          Archivos <span className="ml-1 text-xs opacity-60">({files.total})</span>
        </TabsTrigger>
      </TabsList>
      </div>

      {/* TAREAS */}
      <TabsContent value="tareas">
        <div className="rounded-md border mt-3 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Prioridad</TableHead>
                <TableHead>Fecha límite</TableHead>
                <TableHead>Asignado a</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No hay tareas en este proyecto
                  </TableCell>
                </TableRow>
              ) : (
                tasks.data.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.title}</TableCell>
                    <TableCell>
                      <Badge variant={TASK_STATUS_VARIANT[t.status]}>{TASK_STATUS[t.status]}</Badge>
                    </TableCell>
                    <TableCell>{TASK_PRIORITY[t.priority]}</TableCell>
                    <TableCell>
                      {t.dueDate ? new Date(t.dueDate).toLocaleDateString('es-DO') : '—'}
                    </TableCell>
                    <TableCell>
                      {t.assignedTo
                        ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}`
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      {/* GASTOS */}
      <TabsContent value="gastos">
        <div className="rounded-md border mt-3 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descripción</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No hay gastos registrados
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {expenses.data.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.description}</TableCell>
                      <TableCell>{EXPENSE_CAT[e.category] ?? e.category}</TableCell>
                      <TableCell>{e.supplier?.name ?? '—'}</TableCell>
                      <TableCell>{new Date(e.date).toLocaleDateString('es-DO')}</TableCell>
                      <TableCell className="text-right">{DOP.format(e.amount)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell colSpan={4}>Total</TableCell>
                    <TableCell className="text-right">{DOP.format(totalExpenses)}</TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      {/* PAGOS */}
      <TabsContent value="pagos">
        <div className="rounded-md border mt-3 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descripción</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No hay pagos registrados
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {payments.data.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.description}</TableCell>
                      <TableCell>{PAYMENT_METHOD[p.method] ?? p.method}</TableCell>
                      <TableCell>
                        <Badge variant={PAYMENT_STATUS_VARIANT[p.status]}>
                          {PAYMENT_STATUS[p.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(p.date).toLocaleDateString('es-DO')}</TableCell>
                      <TableCell className="text-right">{DOP.format(p.amount)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell colSpan={4}>Total recibido</TableCell>
                    <TableCell className="text-right">{DOP.format(totalPayments)}</TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      {/* ARCHIVOS */}
      <TabsContent value="archivos">
        {files.data.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm mt-3">
            No hay archivos en este proyecto
          </p>
        ) : (
          <div className="grid gap-2 mt-3 sm:grid-cols-2 lg:grid-cols-3">
            {files.data.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-3 rounded-md border px-3 py-2.5"
              >
                <div className="shrink-0 text-muted-foreground">
                  {f.mimetype.startsWith('image/') ? (
                    <Image className="size-5" />
                  ) : (
                    <FileText className="size-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{f.originalName}</p>
                  <p className="text-xs text-muted-foreground">
                    {FILE_CONTEXT[f.context] ?? f.context} ·{' '}
                    {(f.size / 1024).toFixed(0)} KB
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  render={
                    <a
                      href={`${API_URL}/files/${f.id}/download`}
                      target="_blank"
                      rel="noreferrer"
                    />
                  }
                >
                  <Download className="size-4" />
                  <span className="sr-only">Descargar</span>
                </Button>
              </div>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  )
}
