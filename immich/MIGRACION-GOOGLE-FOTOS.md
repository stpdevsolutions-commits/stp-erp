# Migrar Google Fotos → Immich con immich-go

Guía para importar el Takeout de Google Fotos al servidor Immich (`fotos.stpsoluciones.com`).
Se corre desde una **PC Windows conectada a la VPN**. immich-go **v0.32.0**.

> ⚠️ **No borres Google Fotos ni iCloud** hasta: (1) verificar que todo se importó bien, y
> (2) tener el backup de las fotos funcionando (HDD de 1TB con restic). Ver [../immich pendientes].

---

## Paso 1 — Solicitar el Takeout de Google (hazlo primero, tarda en generarse)

1. Entra a **https://takeout.google.com** con la cuenta de Google.
2. **Deseleccionar todo** → marcar **solo "Google Fotos"**.
3. Botón "Todos los álbumes de fotos incluidos" → puedes dejar todos.
4. Siguiente paso:
   - Frecuencia: **Exportar una vez**
   - Tipo de archivo: **.zip**
   - Tamaño: **50 GB** (así genera menos partes)
5. "Crear exportación". Google tarda desde minutos hasta **horas o días**; avisa por correo.
6. Cuando llegue, **descarga TODAS las partes** (`takeout-XXXXXXXX-001.zip`, `-002.zip`, ...) a una
   carpeta, p. ej. `C:\takeout\`. **No hace falta descomprimirlas** — immich-go lee los .zip directo.

## Paso 2 — Generar la API key en Immich

1. En la web `https://fotos.stpsoluciones.com` (con VPN), clic en tu **avatar** (arriba a la derecha)
   → **Account Settings** (Configuración de la cuenta).
2. Sección **API Keys** → **New API Key** → ponle un nombre (ej. `immich-go-migracion`).
3. **Copia la clave** (solo se muestra una vez) y guárdala. La usarás en `--api-key=`.
   - Recomendado: guardarla también en Vaultwarden.

## Paso 3 — Instalar immich-go en Windows

1. Descarga: **https://github.com/simulot/immich-go/releases/download/v0.32.0/immich-go_Windows_x86_64.zip**
2. Descomprime el `.zip` → obtienes `immich-go.exe` (p. ej. en `C:\immich-go\`).
3. Abre **PowerShell** y ve a esa carpeta: `cd C:\immich-go`

## Paso 4 — Prueba en seco (dry-run) — NO sube nada, solo simula

```powershell
.\immich-go.exe upload from-google-photos `
  --server=https://fotos.stpsoluciones.com `
  --api-key=TU_API_KEY `
  --dry-run `
  C:\takeout\takeout-*.zip
```
Revisa que detecte bien la cantidad de fotos/álbumes y no reporte errores raros.

## Paso 5 — Importación real (ajustada a este servidor)

El server tiene RAM justa (8 GB). Estos flags evitan saturarlo:

```powershell
.\immich-go.exe upload from-google-photos `
  --server=https://fotos.stpsoluciones.com `
  --api-key=TU_API_KEY `
  --pause-immich-jobs=true `
  --concurrent-tasks=2 `
  --client-timeout=60m `
  --on-errors=continue `
  --session-tag `
  C:\takeout\takeout-*.zip
```

Qué hace cada flag:
- `--pause-immich-jobs=true` → pausa el motor de IA de Immich mientras sube (no compite por RAM).
  Al terminar, Immich reanuda y procesa las miniaturas/IA en segundo plano.
- `--concurrent-tasks=2` → sube de a 2 (bajo, para no saturar los 8 GB de RAM). Puedes probar 3-4 si va sobrado.
- `--client-timeout=60m` → tolera partes grandes / red lenta.
- `--on-errors=continue` → si un archivo falla, sigue con el resto.
- `--session-tag` → etiqueta todo lo importado en esta sesión (fácil de identificar/filtrar después).

> immich-go **detecta duplicados** contra el servidor: no re-sube fotos que ya existen idénticas
> (las que ya subió tu celular). Las versiones **recomprimidas** por Google sí entrarán como
> archivos nuevos → se limpian luego (Paso 6).

## Paso 6 — Después de importar

1. En Immich: **Administration → Jobs** → verifica que las tareas (thumbnails, IA) terminen.
2. **Utilities → Duplicates** (detector de duplicados) → revisa y elimina los casi-duplicados
   (original del cel vs. versión recomprimida de Google). Immich sugiere cuál conservar.
3. Verifica álbumes, fechas y ubicaciones de una muestra de fotos.

## Solo cuando TODO esté verificado + backup listo
- Baja el plan de **iCloud** (Ajustes → tu nombre → iCloud) y de **Google One**.

---
Notas: si en vez de Google también quieres migrar un Takeout de **iCloud**, immich-go tiene
`upload from-icloud` con la misma mecánica.
