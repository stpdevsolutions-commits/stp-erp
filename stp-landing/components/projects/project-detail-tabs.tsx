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
import { MapPin, ClipboardList } from 'lucide-react'
import Link from 'next/link'
import type { Task, Expense, Payment, FileUpload, PaginatedResponse, Ficha } from '@/lib/types'
import { ArchivoViewer } from '@/components/files/archivo-viewer'

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

const TASK_STATUS: Record<Task['status'], string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  review: 'En revisión',
  done: 'Completada',
  cancelled: 'Cancelada',
}
// Colores semánticos de estado (tinte suave, coherente con la identidad STP)
const TASK_STATUS_BADGE: Record<Task['status'], string> = {
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  in_progress: 'bg-primary/10 text-primary',
  review: 'bg-primary/10 text-primary',
  done: 'bg-green-600/10 text-green-700 dark:text-green-400',
  cancelled: 'bg-destructive/10 text-destructive',
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
const PAYMENT_STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  completed: 'bg-green-600/10 text-green-700 dark:text-green-400',
  failed: 'bg-destructive/10 text-destructive',
  refunded: 'bg-muted text-muted-foreground',
}

const FICHA_TYPE_LABEL: Record<string, string> = {
  electrico: 'Eléctrico',
  civil: 'Civil',
  electromecanico: 'Electromecánico',
  levantamiento: 'Levantamiento',
  evaluacion_danos: 'Evaluación de daños',
}

const FICHA_STATUS_LABEL: Record<string, string> = {
  borrador: 'Borrador',
  en_progreso: 'En progreso',
  enviada: 'Enviada',
}

const FICHA_STATUS_BADGE: Record<string, string> = {
  borrador: 'bg-muted text-muted-foreground',
  en_progreso: 'bg-primary/10 text-primary',
  enviada: 'bg-green-600/10 text-green-700 dark:text-green-400',
}

export function ProjectDetailTabs({
  tasks,
  expenses,
  payments,
  files,
  fichas,
  clientId,
  projectId,
}: {
  tasks: PaginatedResponse<Task>
  expenses: PaginatedResponse<Expense>
  payments: PaginatedResponse<Payment>
  files: PaginatedResponse<FileUpload>
  fichas: Ficha[]
  clientId: string
  projectId: string
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
        <TabsTrigger value="fichas">
          Fichas <span className="ml-1 text-xs opacity-60">({fichas.length})</span>
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
                      <Badge className={TASK_STATUS_BADGE[t.status]}>{TASK_STATUS[t.status]}</Badge>
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

      {/* FICHAS */}
      <TabsContent value="fichas">
        <div className="rounded-md border mt-3 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Técnico</TableHead>
                <TableHead>GPS</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fichas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    <div className="flex flex-col items-center gap-2">
                      <ClipboardList className="size-8 opacity-30" />
                      <span>No hay fichas de campo en este proyecto</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                fichas.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="font-mono px-0 h-auto" render={<Link href={`/dashboard/fichas/${f.id}`} />}>
                        {f.code}
                      </Button>
                    </TableCell>
                    <TableCell>{FICHA_TYPE_LABEL[f.type] ?? f.type}</TableCell>
                    <TableCell>
                      <Badge className={FICHA_STATUS_BADGE[f.status]}>
                        {FICHA_STATUS_LABEL[f.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {f.technician
                        ? `${f.technician.firstName} ${f.technician.lastName}`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {f.latitude && f.longitude ? (
                        <a
                          href={`https://maps.google.com/?q=${f.latitude},${f.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <MapPin className="size-3" /> Ver
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(f.createdAt).toLocaleDateString('es-DO')}
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
                        <Badge className={PAYMENT_STATUS_BADGE[p.status]}>
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
        <div className="mt-3">
          <ArchivoViewer
            files={files.data}
            clientId={clientId}
            projectId={projectId}
            canDelete={true}
          />
        </div>
      </TabsContent>
    </Tabs>
  )
}
