# STP ERP — Contexto para Claude Code

## Proyecto
ERP para **Soluciones Técnicas Profesionales (STP)**, empresa dominicana de electromecánica y construcción.

## Stack
- **API**: NestJS 11 + TypeScript (`target: ES2023`, `experimentalDecorators: true`)
- **ORM**: TypeORM 1.x con PostgreSQL 15
- **Auth**: JWT 7 días, `@nestjs/passport`
- **Infra**: Docker + Docker Compose (postgres, redis, nginx, stp-api)
- **Runtime**: Node.js 20 LTS

## Estructura del proyecto
```
~/stp/
├── docker-compose.yml
├── .env                    ← secretos (NO en git)
├── .env.example            ← plantilla pública
├── nginx/nginx.conf
└── stp-api/
    ├── Dockerfile.dev      ← imagen de desarrollo (hot reload)
    ├── Dockerfile          ← imagen de producción (multi-stage build)
    ├── package.json
    └── src/
        ├── main.ts         ← Swagger (/docs), CORS, ValidationPipe
        ├── app.module.ts   ← ThrottlerModule (100 req/min), todos los módulos
        ├── data-source.ts  ← DataSource para CLI de TypeORM migrations
        ├── migrations/     ← migraciones TypeORM
        ├── auth/           ← register, login, JWT strategy
        ├── common/
        │   ├── decorators/ ← @CurrentUser(), @Roles()
        │   └── guards/     ← RolesGuard (jerarquía ADMIN > MANAGER > USER)
        ├── users/
        ├── clients/
        ├── projects/       ← código auto PRJ-YYYY-NNN
        ├── tasks/
        ├── quotes/         ← código auto COT-YYYY-NNN, items, recálculo ITBIS 18%
        ├── expenses/
        ├── payments/
        ├── suppliers/
        ├── reports/        ← dashboard, resumen proyecto, balance cliente
        ├── health/         ← GET /health (TypeORM ping)
        └── files/          ← (próximo módulo — file uploads)
```

## Comandos frecuentes
```bash
# Ver logs de la API
docker logs stp-api --tail=50 -f

# Reiniciar la API (después de cambios que hot-reload no detecta)
docker restart stp-api

# Generar nueva migración (después de cambiar una entity)
docker exec stp-api sh -c "./node_modules/.bin/ts-node -r tsconfig-paths/register node_modules/typeorm/cli.js migration:generate src/migrations/NombreCambio -d src/data-source.ts"

# Correr migraciones pendientes
docker exec stp-api sh -c "./node_modules/.bin/ts-node -r tsconfig-paths/register node_modules/typeorm/cli.js migration:run -d src/data-source.ts"

# Ver estado de migraciones
docker exec stp-api sh -c "./node_modules/.bin/ts-node -r tsconfig-paths/register node_modules/typeorm/cli.js migration:show -d src/data-source.ts"

# Acceder a PostgreSQL
docker exec -it stp-postgres psql -U stp_user -d stp_db

# Pull de cambios y rebuild
git pull origin main && docker compose up -d --build stp-api
```

## Convenciones críticas

### 1. Defensive Object.assign en todos los métodos update()
`useDefineForClassFields: true` (ES2023) hace que los campos opcionales de un DTO sean own properties con valor `undefined`. Hacer `Object.assign(entity, dto)` sobreescribe valores con `undefined` → NaN → NULL en DB.

**SIEMPRE usar este patrón en update():**
```typescript
const defined = Object.fromEntries(
  Object.entries(dto as Record<string, unknown>).filter(([, v]) => v !== undefined),
);
Object.assign(entity, defined);
```

### 2. Columnas decimales requieren transformer
```typescript
const dec = {
  to: (v: number) => v,
  from: (v: string) => (v != null ? parseFloat(v) : null),
};
@Column({ type: 'numeric', precision: 12, scale: 2, transformer: dec })
amount: number;
```
Sin el transformer, TypeORM retorna strings desde PostgreSQL y las operaciones aritméticas fallan.

### 3. Columnas nullable usan `string` (no `string | null`)
Convención del proyecto: `@Column({ nullable: true }) notes: string;` — sin `| null` en el tipo TypeScript.

### 4. Relaciones en entities usan object syntax
```typescript
@ManyToOne(() => Client, { nullable: false, onDelete: 'RESTRICT' })
@JoinColumn({ name: 'clientId' })
client: Client;
@Column({ type: 'uuid' }) clientId: string;
```

### 5. Hot reload funciona nativamente en Linux
En este servidor Ubuntu el watch de NestJS detecta cambios en tiempo real. Solo se necesita `docker restart stp-api` cuando se cambia algo fuera de `src/` (package.json, Dockerfile, etc.).

### 6. Migraciones
- **Desarrollo**: `synchronize: true` (TypeORM actualiza el schema automáticamente)
- **Producción**: `synchronize: false`, `migrationsRun: true` (corre migrations al arrancar)
- La migración inicial está en `src/migrations/1780694236262-InitialSchema.ts`

## RBAC
Roles en `UserRole` enum: `ADMIN`, `MANAGER`, `USER`

Jerarquía en `RolesGuard`: ADMIN (rango 3) > MANAGER (rango 2) > USER (rango 1).
`@Roles(UserRole.MANAGER)` permite acceso a MANAGER **y** ADMIN.

| Operación | USER | MANAGER | ADMIN |
|---|:---:|:---:|:---:|
| Leer todo | ✅ | ✅ | ✅ |
| Crear/actualizar tasks y expenses | ✅ | ✅ | ✅ |
| Crear/actualizar clients, projects, quotes, payments, suppliers | ❌ | ✅ | ✅ |
| Ver reports | ❌ | ✅ | ✅ |
| Eliminar | ❌ | solo tasks | ✅ |
| Gestionar usuarios | ❌ | ❌ | ✅ |

## Módulos completados
1. Auth (JWT, register/login)
2. Users (CRUD + roles)
3. Clients
4. Projects (código PRJ-YYYY-NNN)
5. Tasks (completedAt auto al pasar a `done`)
6. Quotes (COT-YYYY-NNN, items, recálculo subtotal → ITBIS 18% → total, lock al aprobar)
7. Expenses (categorías, FK a Supplier opcional)
8. Payments (método, estado, FK a client/project/quote)
9. Suppliers
10. Reports (dashboard, getProjectSummary, getClientBalance)
11. Health check (`GET /health`)
12. Swagger UI (`GET /docs`)

## Próximo módulo: Files (file uploads)
Estructura de carpetas en el servidor:
```
uploads/
└── clients/
    └── {clientId}/
        ├── profile/
        └── projects/
            └── {projectId}/
                ├── photos/
                ├── documents/
                ├── expenses/
                └── quotes/
```

Montado como bind mount en docker-compose:
```yaml
volumes:
  - ./uploads:/app/uploads
```

Usar multer para manejo de archivos. Tipos permitidos: PDF, JPG, JPEG, PNG, WEBP.
Tamaño máximo: 10MB por archivo.

## Facturas
Las facturas se desarrollan en una **app separada** que se integrará al ERP más adelante. No implementar en este repo por ahora.

## Infraestructura del servidor
- **Host**: stp-server (Ubuntu 22.04.5 LTS)
- **IP local**: 10.0.0.86 | **Tailscale**: 100.76.193.7
- **Dominio**: stpsoluciones.com (DNS en Namecheap, pendiente configurar)
- **Acceso**: `ssh stp@10.0.0.86`
- **CPU**: i7-7700T | **RAM**: 8GB | **SSD**: 128GB
- **Email**: Resend API (RESEND_API_KEY en .env.local)
