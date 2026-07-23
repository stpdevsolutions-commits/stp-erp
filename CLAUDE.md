# STP ERP — Contexto para Claude Code

## Proyecto
ERP para **Soluciones Técnicas Profesionales (STP)**, empresa dominicana de electromecánica y construcción.

## Stack
- **API**: NestJS 11 + TypeScript (`target: ES2023`, `experimentalDecorators: true`)
- **Frontend**: Next.js (`stp-landing`) — es el **frontend del ERP** (erp.stpsoluciones.com), no la landing pública; conecta a la API en `http://stp-api:3001`. La landing de stpsoluciones.com vive en Vercel, en el repo aparte `stpsoluciones-landing`.
- **ORM**: TypeORM 1.x con PostgreSQL 15
- **Auth**: JWT 7 días, `@nestjs/passport`
- **Infra**: Docker + Docker Compose — Caddy (reverse proxy), PostgreSQL, Redis, stp-api, stp-landing
- **Runtime**: Node.js 20 LTS

## Estructura del proyecto
```
~/stp/
├── docker-compose.yml
├── .env                      ← secretos (NO en git)
├── .env.example              ← plantilla pública
├── caddy/Caddyfile           ← reverse proxy HTTPS wildcard (DNS-01, Cloudflare)
├── scripts/backup.sh         ← backup diario a Google Drive (cron 2am)
├── logs/backup.log           ← log del cron de backup
├── stp-landing/              ← frontend Next.js del ERP (nombre histórico)
└── stp-api/
    ├── Dockerfile.dev        ← imagen de desarrollo (hot reload)
    ├── Dockerfile            ← imagen de producción (multi-stage build)
    ├── package.json
    └── src/
        ├── main.ts           ← Swagger (/docs), CORS, ValidationPipe
        ├── app.module.ts     ← ThrottlerModule (100 req/min), todos los módulos
        ├── data-source.ts    ← DataSource para CLI de TypeORM migrations
        ├── migrations/       ← migraciones TypeORM
        ├── auth/             ← register, login, JWT strategy
        ├── common/
        │   ├── decorators/   ← @CurrentUser(), @Roles()
        │   └── guards/       ← RolesGuard (jerarquía ADMIN > MANAGER > USER)
        ├── users/
        ├── clients/
        ├── projects/         ← código auto PRJ-YYYY-NNN
        ├── tasks/
        ├── quotes/           ← código auto COT-YYYY-NNN, items, ITBIS 18%
        ├── expenses/
        ├── payments/
        ├── suppliers/
        ├── reports/          ← dashboard, resumen proyecto, balance cliente
        ├── health/           ← GET /health (TypeORM ping)
        ├── files/            ← uploads multer (PDF/JPG/PNG/WEBP, 10MB)
        ├── collaborators/    ← empleados/técnicos (cédula, tarifa diaria)
        ├── fichas/           ← fichas técnicas de campo + generación PDF
        ├── inventory/        ← materiales, equipos, herramientas
        ├── settings/         ← configuración empresa (logo, nombre, términos)
        ├── notifications/    ← emails via Resend (cotizaciones, tareas, fichas)
        └── scheduler/        ← cron jobs (cotizaciones por vencer, tareas vencidas)
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

### 5. stp-api corre en MODO PRODUCCIÓN (desde 2026-07-22) — ya NO hay hot reload
El contenedor usa el `Dockerfile` multi-stage (`node dist/main`), `NODE_ENV=production` (en `.env`) → `synchronize:false` + `migrationsRun:true` + sin log SQL. **Cualquier cambio en `stp-api/` requiere `docker compose up -d --build stp-api`.** Cambios de schema requieren migración (la imagen prod no tiene `src/` ni ts-node: generar la migración en un entorno dev — p. ej. levantando temporalmente el servicio con `Dockerfile.dev` — y comitearla). Para volver a dev: `Dockerfile.dev` + volumen `./stp-api/src:/app/src` + `command: npm run start:dev` en compose y `NODE_ENV=development`.

### 6. Migraciones
- **Desarrollo**: `synchronize: true` (TypeORM actualiza el schema automáticamente)
- **Producción**: `synchronize: false`, `migrationsRun: true` (corre migrations al arrancar)
- Migraciones en `src/migrations/` — hay pendientes sin correr (el schema se mantiene con synchronize en dev)

## RBAC
Roles en `UserRole` enum: `ADMIN`, `MANAGER`, `USER`

Jerarquía en `RolesGuard`: ADMIN (rango 3) > MANAGER (rango 2) > USER (rango 1).
`@Roles(UserRole.MANAGER)` permite acceso a MANAGER **y** ADMIN.

| Operación | USER | MANAGER | ADMIN |
|---|:---:|:---:|:---:|
| Leer todo | ✅ | ✅ | ✅ |
| Crear/actualizar tasks, expenses, fichas | ✅ | ✅ | ✅ |
| Crear/actualizar clients, projects, quotes, payments, suppliers, collaborators, inventory | ❌ | ✅ | ✅ |
| Subir archivos (files) | ❌ | ✅ | ✅ |
| Ver reports | ❌ | ✅ | ✅ |
| Eliminar | ❌ | tasks + fichas propias | ✅ |
| Gestionar usuarios, settings | ❌ | ❌ | ✅ |

## Módulos completados
1. **Auth** — JWT register/login, refresh tokens
2. **Users** — CRUD + roles (ADMIN/MANAGER/USER)
3. **Clients** — clientes con tipo (persona/empresa), RNC
4. **Projects** — código auto PRJ-YYYY-NNN, tipos (electrical/mechanical/construction/maintenance)
5. **Tasks** — completedAt automático al pasar a `done`
6. **Quotes** — COT-YYYY-NNN, items, subtotal → ITBIS 18% → total, lock al aprobar
7. **Expenses** — categorías, FK a Supplier opcional
8. **Payments** — método, estado, FK a client/project/quote
9. **Suppliers** — proveedores
10. **Reports** — dashboard, getProjectSummary, getClientBalance
11. **Health** — `GET /health` (TypeORM ping)
12. **Swagger** — `GET /docs`
13. **Files** — uploads multer, 8 contextos (perfil cliente, fotos/docs/gastos/cotizaciones/pagos por proyecto), validación magic bytes, descarga segura (path traversal protegido). Almacenado en `/storage/erp-uploads`
14. **Collaborators** — empleados/técnicos (nombre, cédula, posición, tarifa diaria)
15. **Fichas** — fichas técnicas de campo (eléctrico, civil, electromecánico, levantamiento, evaluación de daños), datos en JSONB, GPS, fotos, firma digital, generación PDF, integración app móvil
16. **Inventory** — materiales, equipos, herramientas con categorías y SKU
17. **Settings** — configuración empresa (logo, nombre, términos y condiciones)
18. **Notifications** — emails via Resend (cotizaciones enviadas/aprobadas, tareas vencidas)
19. **Scheduler** — cron diario 8am: alerta cotizaciones a 3 días de vencer, tareas vencidas; 9am: recordatorio al cliente de cotizaciones `sent` sin respuesta (a partir de 3 días, máx. 2 por envío)

## Módulo Fichas — contexto adicional
Las fichas son el módulo central de la **app móvil** (Expo/React Native). Los técnicos crean fichas en campo, las llenan con datos estructurados (JSONB por tipo), adjuntan fotos y firma, y las envían (`POST /fichas/:id/submit`). El servidor genera un PDF (`GET /fichas/:id/pdf`).

Tipos de ficha: `electrico`, `civil`, `electromecanico`, `levantamiento`, `evaluacion_danos`
Estados: `borrador` → `en_progreso` → `enviada`

## Almacenamiento de archivos
```
/storage/erp-uploads/          ← montado como /app/uploads en stp-api
└── clients/
    └── {clientId}/
        ├── profile/
        ├── quotes/
        ├── payments/
        └── projects/
            └── {projectId}/
                ├── photos/
                ├── documents/
                ├── expenses/
                ├── quotes/
                └── payments/
```
Tipos permitidos: PDF, JPG, PNG, WEBP. Tamaño máximo: 10MB. Nombre en disco: UUID + extensión.

## Facturas
Las facturas se desarrollan en una **app separada** que se integrará al ERP más adelante. No implementar en este repo por ahora.

## Infraestructura del servidor
- **Host**: stp-server (Ubuntu 22.04.5 LTS) — permanentemente en casa de Pedro
- **IP local**: por DHCP, **cambia** (192.168.4.30 al 2026-07-23) | **Tailscale VPN**: 100.64.0.6 (fija)
- **Acceso SSH**: usar siempre `ssh stp@100.64.0.6` o `ssh stp@stp-server` (VPN); la IP LAN no es estable
- **CPU**: i7-7700T | **RAM**: 8GB
- **Discos**: SSD 119GB (`/`) · HDD 220GB (`/data`, Docker data root) · HDD 458GB (`/storage`, datos persistentes)
- **Dominio**: stpsoluciones.com — VPN-only para las apps privadas. La landing pública está en Vercel; el Cloudflare Tunnel solo expone `gw.stpsoluciones.com/erp-api/quotes/decision` (botones aprobar/rechazar de los correos)
- **Email**: Resend API (`RESEND_API_KEY` en .env)
