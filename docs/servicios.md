# Soluciones Técnicas Profesionales — Directorio de Servicios

**Empresa:** Soluciones Técnicas Profesionales (STP)  
**Dominio principal:** stpsoluciones.com  
**Servidor:** stp-server (Ubuntu 22.04.5 LTS) — IP local: 192.168.4.41 — VPN: 100.64.0.6  
**Acceso:** Los servicios marcados con 🔒 requieren estar en la red Wi-Fi de la oficina o conectado al VPN (Headscale/Tailscale).

---

## 1. Sitio Web Público

| Campo | Detalle |
|---|---|
| **URL** | https://stpsoluciones.com |
| **Acceso** | Público (internet) |
| **Descripción** | Página de presentación de la empresa. Información institucional, servicios ofrecidos y datos de contacto. Visible desde cualquier dispositivo sin VPN. |

---

## 2. ERP — Sistema de Gestión Interno

| Campo | Detalle |
|---|---|
| **URL** | https://erp.stpsoluciones.com |
| **Acceso** | 🔒 VPN / Red local |
| **Descripción** | Sistema de gestión empresarial completo: clientes, proyectos, cotizaciones, tareas, gastos, pagos, proveedores, colaboradores, inventario y reportes. Requiere usuario y contraseña. |

**Módulos disponibles:**

- **Clientes** — Registro y seguimiento de clientes (personas y empresas, con RNC).
- **Proyectos** — Gestión de proyectos eléctricos, mecánicos, de construcción y mantenimiento (código PRJ-YYYY-NNN).
- **Cotizaciones** — Generación de cotizaciones con ítems, subtotal e ITBIS 18% (código COT-YYYY-NNN).
- **Tareas** — Asignación y seguimiento de tareas por proyecto.
- **Gastos** — Registro de gastos por categoría, vinculables a proveedores.
- **Pagos** — Control de pagos recibidos por cliente, proyecto o cotización.
- **Proveedores** — Directorio de proveedores y subcontratistas.
- **Colaboradores** — Empleados y técnicos (cédula, posición, tarifa diaria).
- **Inventario** — Materiales, equipos y herramientas con SKU y categorías.
- **Archivos** — Subida y descarga de PDFs, fotos y documentos por proyecto/cliente.
- **Reportes** — Dashboard ejecutivo, resumen por proyecto, balance por cliente.
- **Fichas técnicas** — Creación y consulta de fichas de campo generadas desde la app móvil.

**Roles de usuario:**

| Rol | Permisos |
|---|---|
| ADMIN | Acceso total, gestión de usuarios y configuración |
| MANAGER | Crea/edita todo excepto usuarios y configuración del sistema |
| USER (técnico) | Solo visualiza proyectos y crea fichas/tareas propias |

---

## 3. API del ERP

| Campo | Detalle |
|---|---|
| **URL** | https://api.stpsoluciones.com |
| **Acceso** | 🔒 VPN / Red local |
| **Descripción** | API REST (NestJS). Consumida por el ERP y la app móvil. Documentación interactiva disponible en https://api.stpsoluciones.com/docs |

---

## 4. EstrucCalc RD Pro

| Campo | Detalle |
|---|---|
| **URL** | http://192.168.4.41:8091 |
| **Acceso** | 🔒 VPN / Red local |
| **Descripción** | Aplicación web de cálculo estructural bajo normativas dominicanas (NSRDom R-001), ACI 318-19, ACI 530-13 y ASCE 7-22. Diseñada para ingenieros estructurales. |

**Módulos disponibles:**

- **Estructura aporticada:** Losas (1 y 2 direcciones), Vigas, Columnas (diagrama P-M), Zapatas aisladas.
- **Mampostería confinada:** Muros, Vigas de amarre, Columnas de confinamiento, Zapatas corridas.
- **Muros de hormigón:** Shear walls, Losas, Zapatas corridas.
- **Resumen y PDF:** Consolidado de todos los módulos con impresión directa.

---

## 5. App Móvil — STP Tecnicos

| Campo | Detalle |
|---|---|
| **Plataforma** | Android (APK) |
| **Acceso** | 🔒 VPN / Red local (para sincronizar) |
| **Descripción** | Aplicación para técnicos de campo. Permite ver los proyectos asignados, crear y llenar fichas técnicas, adjuntar fotos y firma digital, y sincronizar con el servidor. Funciona en modo offline cuando no hay conexión. |
| **Archivo APK** | `/home/stp/stp/stp-mobile/build-1782704686444.apk` |

---

## 6. Nextcloud — Archivos Compartidos

| Campo | Detalle |
|---|---|
| **URL** | https://cloud.stpsoluciones.com |
| **Acceso** | 🔒 VPN / Red local |
| **Descripción** | Plataforma de archivos compartidos del equipo. Permite subir, organizar y compartir documentos, fotos y archivos de proyecto. Los archivos subidos desde el ERP también aparecen aquí automáticamente. Inicio de sesión con cuenta Google de STP. |

---

## 7. Vaultwarden — Gestor de Contraseñas

| Campo | Detalle |
|---|---|
| **URL** | https://vault.stpsoluciones.com |
| **Acceso** | 🔒 VPN / Red local |
| **Descripción** | Gestor de contraseñas seguro para el equipo (compatible con clientes Bitwarden). Almacena credenciales, notas seguras y datos de acceso a sistemas de clientes. Inicio de sesión con cuenta Google de STP. |

---

## 8. Uptime Kuma — Monitoreo

| Campo | Detalle |
|---|---|
| **URL** | https://status.stpsoluciones.com |
| **Acceso** | 🔒 VPN / Red local |
| **Descripción** | Panel de monitoreo de disponibilidad de todos los servicios. Muestra el estado en tiempo real y el historial de uptime. Envía alertas cuando un servicio falla. |

---

## 9. AdGuard Home — DNS Interno

| Campo | Detalle |
|---|---|
| **URL** | https://dns.stpsoluciones.com |
| **Acceso** | 🔒 Solo administrador |
| **Descripción** | Servidor DNS interno con bloqueo de anuncios y rastreadores. Gestiona la resolución de nombres internos de los servicios. |

---

## 10. Headscale VPN

| Campo | Detalle |
|---|---|
| **URL Control** | https://vpn.stpsoluciones.com |
| **Acceso** | Administrador |
| **Descripción** | Servidor VPN mesh (Tailscale self-hosted). Permite acceder de forma segura a todos los servicios internos desde cualquier lugar. Se conecta usando el cliente Tailscale con el servidor de control vpn.stpsoluciones.com. Inicio de sesión con cuenta Google de STP. |

---

## Resumen de accesos

| Servicio | URL | VPN requerido |
|---|---|:---:|
| Sitio Web | stpsoluciones.com | No |
| ERP | erp.stpsoluciones.com | Sí |
| EstrucCalc RD Pro | 192.168.4.41:8091 | Sí |
| Nextcloud | cloud.stpsoluciones.com | Sí |
| Vaultwarden | vault.stpsoluciones.com | Sí |
| Uptime Kuma | status.stpsoluciones.com | Sí |
| AdGuard Home | dns.stpsoluciones.com | Sí |
| VPN (control) | vpn.stpsoluciones.com | — |
