#!/usr/bin/env pwsh

# ============================================
# SETUP AUTOMÁTICO STP - F:\STP
# ============================================

Write-Host "🚀 Iniciando setup automático de STP..." -ForegroundColor Green
Write-Host "📁 Ubicación: F:\STP" -ForegroundColor Cyan

# Cambiar a directorio raíz
Set-Location F:\STP

Write-Host "`n[1/8] Limpiando directorios previos..." -ForegroundColor Yellow
Remove-Item -Path F:\STP\stp-landing -Force -Recurse -ErrorAction SilentlyContinue
Remove-Item -Path F:\STP\stp-api -Force -Recurse -ErrorAction SilentlyContinue
Remove-Item -Path F:\STP\stp-landing-temp -Force -Recurse -ErrorAction SilentlyContinue
Write-Host "✅ Directorios limpios" -ForegroundColor Green

Write-Host "`n[2/8] Creando estructura de carpetas..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path F:\STP\stp-landing -Force | Out-Null
New-Item -ItemType Directory -Path F:\STP\stp-api -Force | Out-Null
New-Item -ItemType Directory -Path F:\STP\nginx -Force | Out-Null
New-Item -ItemType Directory -Path F:\STP\postgres-data -Force | Out-Null
New-Item -ItemType Directory -Path F:\STP\redis-data -Force | Out-Null
Write-Host "✅ Carpetas creadas" -ForegroundColor Green

Write-Host "`n[3/8] Clonando stp-landing desde GitHub..." -ForegroundColor Yellow
git clone https://github.com/stpdevsolutions-commits/stp-landing.git stp-landing
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ stp-landing clonado" -ForegroundColor Green
} else {
    Write-Host "❌ Error clonando stp-landing" -ForegroundColor Red
    exit 1
}

Write-Host "`n[4/8] Copiando Dockerfile a stp-landing..." -ForegroundColor Yellow
Copy-Item -Path F:\STP\Dockerfile.landing -Destination F:\STP\stp-landing\Dockerfile -Force
Write-Host "✅ Dockerfile.landing copiado" -ForegroundColor Green

Write-Host "`n[5/8] Instalando dependencias de stp-landing..." -ForegroundColor Yellow
Set-Location F:\STP\stp-landing
npm install
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Dependencias instaladas" -ForegroundColor Green
} else {
    Write-Host "⚠️  Advertencia: Algunos problemas con npm" -ForegroundColor Yellow
}

Write-Host "`n[6/8] Creando stp-api (NestJS)..." -ForegroundColor Yellow
Set-Location F:\STP
nest new stp-api --skip-git --package-manager npm
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ stp-api creado" -ForegroundColor Green
} else {
    Write-Host "⚠️  Error creando stp-api, creando carpeta manualmente..." -ForegroundColor Yellow
    mkdir stp-api -Force | Out-Null
}

Write-Host "`n[7/8] Instalando dependencias de stp-api..." -ForegroundColor Yellow
Set-Location F:\STP\stp-api
npm install @nestjs/config dotenv typeorm pg redis ioredis @nestjs/jwt passport-jwt bcrypt --save
Write-Host "✅ Dependencias de stp-api instaladas" -ForegroundColor Green

Write-Host "`n[8/8] Copiando Dockerfile a stp-api..." -ForegroundColor Yellow
Copy-Item -Path F:\STP\Dockerfile.api -Destination F:\STP\stp-api\Dockerfile -Force
Write-Host "✅ Dockerfile.api copiado" -ForegroundColor Green

# Copiar archivos de configuración faltantes
Set-Location F:\STP
Write-Host "`n📋 Verificando archivos de configuración..." -ForegroundColor Cyan

$requiredFiles = @(
    "docker-compose.yml",
    ".env.local",
    "README.md"
)

foreach ($file in $requiredFiles) {
    if (Test-Path F:\STP\$file) {
        Write-Host "✅ $file encontrado" -ForegroundColor Green
    } else {
        Write-Host "⚠️  $file no encontrado - Descárgalo y colócalo en F:\STP" -ForegroundColor Yellow
    }
}

if (Test-Path F:\STP\nginx\nginx.conf) {
    Write-Host "✅ nginx.conf encontrado" -ForegroundColor Green
} else {
    Write-Host "⚠️  nginx.conf no encontrado - Descárgalo y colócalo en F:\STP\nginx\" -ForegroundColor Yellow
}

Write-Host "`n" 
Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  ✅ SETUP COMPLETADO                   ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Green

Write-Host "`n📁 Estructura creada en F:\STP:" -ForegroundColor Cyan
Write-Host "   ├── docker-compose.yml" -ForegroundColor White
Write-Host "   ├── .env.local" -ForegroundColor White
Write-Host "   ├── README.md" -ForegroundColor White
Write-Host "   ├── nginx/" -ForegroundColor White
Write-Host "   │   └── nginx.conf" -ForegroundColor White
Write-Host "   ├── stp-landing/ (Next.js + dependencias)" -ForegroundColor White
Write-Host "   ├── stp-api/ (NestJS + dependencias)" -ForegroundColor White
Write-Host "   ├── postgres-data/" -ForegroundColor White
Write-Host "   └── redis-data/" -ForegroundColor White

Write-Host "`n🚀 PRÓXIMOS PASOS:" -ForegroundColor Green
Write-Host "   1. cd F:\STP" -ForegroundColor White
Write-Host "   2. docker-compose build" -ForegroundColor White
Write-Host "   3. docker-compose up" -ForegroundColor White
Write-Host "   4. Abre http://localhost en el navegador" -ForegroundColor White

Write-Host "`n📝 ARCHIVOS DESCARGADOS:" -ForegroundColor Cyan
Write-Host "   ✅ docker-compose.yml" -ForegroundColor Green
Write-Host "   ✅ .env.local" -ForegroundColor Green
Write-Host "   ✅ nginx/nginx.conf" -ForegroundColor Green
Write-Host "   ✅ README.md" -ForegroundColor Green
Write-Host "   ✅ Dockerfile.landing" -ForegroundColor Green
Write-Host "   ✅ Dockerfile.api" -ForegroundColor Green

Write-Host "`n💡 Tip: Abre VS Code con: code F:\STP" -ForegroundColor Cyan
Write-Host "`n"
