# STP ERP

Sistema de gestión interno de **Soluciones Técnicas Profesionales** — empresa dominicana de electromecánica y construcción.

---

## Stack

| Capa | Tecnología |
|---|---|
| API | NestJS 11 + TypeScript, TypeORM, PostgreSQL 15 |
| Frontend | Next.js 16 (App Router) |
| Auth | JWT 7 días (`@nestjs/passport`) |
| Infra | Docker + Docker Compose, Nginx |

---

## Estructura del repositorio

```
stp/
├── docker-compose.yml
├── .env                    ← secretos (NO en git)
├── .env.example            ← plantilla pública
├── stp-api/                ← NestJS API
└── stp-landing/            ← Next.js frontend
```

---

## Configuración

Copia `.env.example` a `.env` y completa los valores:

```bash
cp .env.example .env
```

Las variables necesarias están documentadas en `.env.example`. Nunca pongas credenciales reales en este repositorio.

---

## Levantar el ambiente

```bash
# Primera vez o tras cambios en dependencias
docker compose up -d --build

# Iniciar sin reconstruir
docker compose up -d

# Ver logs de la API
docker logs stp-api --tail=50 -f

# Ver logs del frontend
docker logs stp-landing --tail=50 -f
```

---

## Comandos frecuentes (API)

```bash
# Generar migración tras cambiar una entity
docker exec stp-api sh -c "./node_modules/.bin/ts-node -r tsconfig-paths/register node_modules/typeorm/cli.js migration:generate src/migrations/NombreCambio -d src/data-source.ts"

# Correr migraciones pendientes
docker exec stp-api sh -c "./node_modules/.bin/ts-node -r tsconfig-paths/register node_modules/typeorm/cli.js migration:run -d src/data-source.ts"

# Acceder a PostgreSQL
docker exec -it stp-postgres psql -U stp_user -d stp_db

# Reiniciar API (cambios fuera de src/)
docker restart stp-api
```

---

## Rebuild del frontend

```bash
docker compose up -d --build stp-landing
```

---

## Acceso

| Servicio | URL |
|---|---|
| Frontend | http://localhost |
| API | http://localhost/api |
| Health check | http://localhost/health |
| Swagger | http://localhost/docs |

---

## Troubleshooting

```bash
# Contenedor no inicia
docker compose logs stp-landing
docker compose logs stp-api

# Rebuild sin caché
docker compose build --no-cache stp-landing
docker compose build --no-cache stp-api

# Ver estado de contenedores
docker compose ps
```
