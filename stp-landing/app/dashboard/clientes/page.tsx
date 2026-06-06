import { api } from '@/lib/api'
import type { Client, PaginatedResponse } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users } from 'lucide-react'
import { NuevoClienteDialog } from '@/components/clients/nuevo-cliente-dialog'
import { ClientActions } from '@/components/clients/client-actions'

const TYPE_LABELS = { company: 'Empresa', individual: 'Persona física' }

export default async function ClientesPage() {
  let clientes: Client[] = []
  let error: string | null = null

  try {
    const res = await api.get<PaginatedResponse<Client>>('/clients?limit=100')
    clientes = res.data
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar clientes'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground text-sm">Gestión de clientes del sistema</p>
        </div>
        <NuevoClienteDialog />
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total clientes</CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clientes.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Activos</CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clientes.filter((c) => c.isActive).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Inactivos</CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clientes.filter((c) => !c.isActive).length}</div>
          </CardContent>
        </Card>
      </div>

      {error ? (
        <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>RNC / Cédula</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No hay clientes registrados
                  </TableCell>
                </TableRow>
              ) : (
                clientes.map((cliente) => (
                  <TableRow key={cliente.id}>
                    <TableCell className="font-medium">
                      <div>{cliente.name}</div>
                      {cliente.email && (
                        <div className="text-xs text-muted-foreground">{cliente.email}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{TYPE_LABELS[cliente.type] ?? cliente.type}</span>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{cliente.rnc ?? '—'}</TableCell>
                    <TableCell>{cliente.phone ?? '—'}</TableCell>
                    <TableCell>{cliente.city ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={cliente.isActive ? 'default' : 'secondary'}>
                        {cliente.isActive ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <ClientActions cliente={cliente} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
