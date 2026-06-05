# 🚀 Setup Desarrollo Local - STP

**Ubicación**: `F:\STP`  
**Ambiente**: Windows con Docker Desktop  
**Status**: Desarrollo en progreso

---

## 📋 Requisitos Previos

Verifica que tengas instalado:

```powershell
# Verificar versiones
docker --version          # Docker Desktop v4.x+
docker-compose --version  # v2.x+
node --version           # v20.x
npm --version            # 10.x+
```

Si falta algo, instala:
- **Docker Desktop**: https://www.docker.com/products/docker-desktop/
- **Node.js 20 LTS**: https://nodejs.org/

---

## 📁 Estructura de Carpetas

```
F:\STP\
├── docker-compose.yml       ← Orquestación de servicios
├── .env.local              ← Variables de entorno
├── nginx/
│   └── nginx.conf          ← Configuración del proxy
├── stp-landing/            ← Next.js (clonar de GitHub)
├── stp-api/                ← NestJS API (crear nuevo)
├── postgres-data/          ← Base de datos (Docker volume)
└── redis-data/             ← Cache (Docker volume)
```

---

## 🔧 PASO 1: Clonar stp-landing

```powershell
cd F:\STP

# Clonar repositorio
git clone https://github.com/stpdevsolutions-commits/stp-landing.git

# Entrar a la carpeta
cd stp-landing

# Instalar dependencias
npm install

# Regresar a raíz
cd ..
```

---

## 🆕 PASO 2: Crear stp-api (NestJS)

```powershell
cd F:\STP

# Crear proyecto NestJS
npm i -g @nestjs/cli
nest new stp-api

# Entrar a la carpeta
cd stp-api

# Instalar dependencias necesarias
npm install @nestjs/config dotenv typeorm pg redis ioredis @nestjs/jwt passport-jwt

# Regresar a raíz
cd ..
```

---

## 📂 PASO 3: Crear carpeta nginx

```powershell
# En F:\STP, crear carpeta
mkdir nginx

# El archivo nginx.conf ya debe estar en F:\STP\
# Asegúrate de que esté en F:\STP\nginx\nginx.conf
```

---

## 🐳 PASO 4: Iniciar Servicios Docker

```powershell
cd F:\STP

# Construir imágenes
docker-compose build

# Iniciar servicios
docker-compose up

# Verifica que todo esté corriendo:
# ✅ stp-postgres (puerto 5432)
# ✅ stp-redis (puerto 6379)
# ✅ stp-landing (puerto 3000)
# ✅ stp-api (puerto 3001)
# ✅ stp-nginx (puerto 80)
```

---

## 🌐 PASO 5: Acceder a los Servicios

Desde otra terminal PowerShell:

```powershell
# Landing Page
curl http://localhost

# API Health
curl http://localhost/health

# Direct URLs
# Landing: http://localhost:3000
# API: http://localhost:3001
# Nginx: http://localhost
```

---

## 💾 Base de Datos

### Conectar a PostgreSQL

```bash
# Dentro del contenedor
docker exec -it stp-postgres psql -U stp_user -d stp_db

# O desde tu máquina (si tienes psql instalado)
psql -h localhost -U stp_user -d stp_db
# Contraseña: STP_Password_2024!
```

### Conectar a Redis

```bash
# Dentro del contenedor
docker exec -it stp-redis redis-cli
# Comando: AUTH Redis_Password_2024!

# O desde tu máquina (si tienes redis-cli)
redis-cli -h localhost -p 6379
# Comando: AUTH Redis_Password_2024!
```

---

## 📝 Variables de Entorno

El archivo `.env.local` ya está configurado con:

- **PostgreSQL**: Usuario `stp_user`, contraseña `STP_Password_2024!`
- **Redis**: Contraseña `Redis_Password_2024!`
- **Resend API**: `re_K9xRknA7_AHVpstZJEuQTuwQ8has1abiL`
- **JWT Secret**: `your-jwt-secret-key-change-in-production`

### Para Producción (servidor)
Cambiarás estos valores cuando despliegues al servidor.

---

## 🔄 Comandos Útiles

```powershell
# Ver logs en tiempo real
docker-compose logs -f stp-landing
docker-compose logs -f stp-api
docker-compose logs -f stp-nginx

# Reiniciar un servicio
docker-compose restart stp-landing
docker-compose restart stp-api

# Detener todos
docker-compose down

# Limpiar volúmenes (CUIDADO: elimina datos)
docker-compose down -v

# Construir sin caché
docker-compose build --no-cache

# Ver estado de contenedores
docker-compose ps
```

---

## 🛠️ Desarrollo Local

### Hot Reload habilitado para:
- ✅ **stp-landing** (Next.js): Cambios automáticos en http://localhost:3000
- ✅ **stp-api** (NestJS): Cambios automáticos en http://localhost:3001

### Editar archivos
- Abre `F:\STP` con VS Code
- Los cambios se reflejan automáticamente en los contenedores

```powershell
cd F:\STP
code .
```

---

## 🚨 Troubleshooting

### Puerto ya en uso
```powershell
# Buscar qué proceso usa el puerto
netstat -ano | findstr :80
# Matar proceso
taskkill /PID <PID> /F
```

### Contenedor no inicia
```powershell
# Ver logs detallados
docker-compose logs stp-landing
docker-compose logs stp-api

# Reconstruir
docker-compose build --no-cache stp-landing
docker-compose up stp-landing
```

### Base de datos corrupta
```powershell
# Eliminar volúmenes y recrear
docker-compose down -v
docker-compose up
```

---

## 📦 Siguientes Pasos

1. ✅ Ambiente local funcionando
2. ⏳ Conectar stp-landing a PostgreSQL + Redis
3. ⏳ Desarrollar módulos NestJS (Auth, Usuarios, Proyectos, etc.)
4. ⏳ Crear panel administrativo (stp-admin)
5. ⏳ Desplegar al servidor Ubuntu

---

## 🔐 Seguridad Local

⚠️ **Estos valores son SOLO para desarrollo**. Cuando despliegues al servidor:
- Cambia todas las contraseñas
- Usa JWT_SECRET fuerte
- Configura SSL/TLS con Let's Encrypt
- Habilita autenticación VPN

---

**¿Necesitas ayuda?** Revisa los logs o pregunta al equipo.
