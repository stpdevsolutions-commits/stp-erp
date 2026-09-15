﻿import { api, pageError } from '@/lib/api'
import type { Client, PaginatedResponse, User } from '@/lib/types'
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
import Link from 'next/link'
import { NuevoClienteDialog } from '@/components/clients/nuevo-cliente-dialog'
import { ClientActions } from '@/components/clients/client-actions'
import { FiltrosClientes } from '@/components/clientes/filtros-clientes'
import { Paginacion } from '@/components/ui/paginacion'

const TYPE_LABELS = { company: 'Empresa', individual: 'Persona física' }

// Colores semánticos de tipo (tinte suave, coherente con la identidad STP)
const TYPE_BADGE = {
  company: 'bg-primary/10 text-primary',
  individual: 'bg-accent text-accent-foreground',
}

const LIMIT = 20

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.page ?? '1'))
  const search = sp.search ?? ''
  const type = sp.type ?? ''

  const query = new URLSearchParams({ limit: String(LIMIT), page: String(page) })
  if (search) query.set('search', search)
  if (type) query.set('type', type)

  let res: PaginatedResponse<Client> = { data: [], total: 0, page: 1, limit: LIMIT }
  let error: string | null = null
  let userRole = 'USER'

  const [clientsRes, meRes] = await Promise.allSettled([
    api.get<PaginatedResponse<Client>>(`/clients?${query}`),
    api.get<Pick<User, 'role'>>('/users/me'),
  ])
  if (clientsRes.status === 'fulfilled') {
    res = clientsRes.value
  } else {
    error = pageError(clientsRes.reason, 'Error al cargar clientes')
  }
  if (meRes.status === 'fulfilled') userRole = meRes.value.role

  const clientes = res.data
  const isManager = ['ADMIN', 'admin', 'MANAGER', 'manager'].includes(userRole)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground text-sm">Gestión de clientes del sistema</p>
        </div>
        {isManager && <NuevoClienteDialog />}
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total clientes</CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{res.total}</div>
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

      <FiltrosClientes />

      {error ? (
        <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>
      ) : (
        <>
          <div className="rounded-md border overflow-x-auto">
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
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No hay clientes registrados
                    </TableCell>
                  </TableRow>
                ) : (
                  clientes.map((cliente) => (
                    <TableRow key={cliente.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/dashboard/clientes/${cliente.id}`}
                          className="hover:underline underline-offset-2"
                        >
                          {cliente.name}
                        </Link>
                        {cliente.email && (
                          <div className="text-xs text-muted-foreground">{cliente.email}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={TYPE_BADGE[cliente.type]}>
                          {TYPE_LABELS[cliente.type] ?? cliente.type}
                        </Badge>
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
                        <ClientActions cliente={cliente} userRole={userRole} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <Paginacion total={res.total} page={page} limit={LIMIT} />
        </>
      )}
    </div>
  )
}
