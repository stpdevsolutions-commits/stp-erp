# Manual de Usuario — ERP STP

**Sistema:** ERP Soluciones Técnicas Profesionales  
**URL:** https://erp.stpsoluciones.com  
**Requisito:** Estar conectado a la red Wi-Fi de la oficina o al VPN (Headscale/Tailscale)

---

## 1. Acceso al sistema

1. Abre el navegador y entra a **https://erp.stpsoluciones.com**
2. Ingresa tu **correo electrónico** y **contraseña**
3. Haz clic en **Iniciar sesión**

> Si ves un error de conexión, verifica que estés conectado al VPN o en la red de la oficina.

---

## 2. Roles y permisos

| Rol | Descripción |
|---|---|
| **ADMIN** | Acceso total. Gestiona usuarios, configuración del sistema y todos los módulos. |
| **MANAGER** | Crea y edita clientes, proyectos, cotizaciones, gastos, pagos, proveedores, inventario y colaboradores. |
| **USER** | Solo puede ver proyectos asignados y crear fichas técnicas y tareas propias. |

---

## 3. Clientes

### Crear un cliente

1. En el menú lateral, haz clic en **Clientes**
2. Clic en **Nuevo cliente**
3. Completa: nombre, tipo (Persona / Empresa), RNC/Cédula, teléfono, correo, dirección
4. Clic en **Guardar**

### Editar o ver un cliente

- En la lista de clientes, haz clic sobre el nombre del cliente
- Desde aquí puedes ver sus proyectos, cotizaciones, pagos y archivos adjuntos

---

## 4. Proyectos

### Crear un proyecto

1. Menú lateral → **Proyectos** → **Nuevo proyecto**
2. Completa:
   - **Nombre** del proyecto
   - **Cliente** (selecciona de la lista)
   - **Tipo:** Eléctrico, Mecánico, Construcción o Mantenimiento
   - **Descripción** y **ubicación**
3. El sistema asigna automáticamente un código **PRJ-YYYY-NNN**
4. Clic en **Guardar**

### Estados de proyecto

| Estado | Descripción |
|---|---|
| Activo | En ejecución |
| Completado | Finalizado |
| En pausa | Detenido temporalmente |
| Cancelado | Anulado |

---

## 5. Cotizaciones

### Crear una cotización

1. Menú lateral → **Cotizaciones** → **Nueva cotización**
2. Selecciona el **cliente** y opcionalmente el **proyecto**
3. Agrega ítems: descripción, cantidad, precio unitario
4. El sistema calcula automáticamente el subtotal y el **ITBIS (18%)**
5. Clic en **Guardar**
6. El código se genera automáticamente: **COT-YYYY-NNN**

### Flujo de una cotización

```
Borrador → Enviada al cliente → Aprobada → Facturada
                              ↘ Rechazada
```

> Una vez aprobada, la cotización queda **bloqueada** y no puede modificarse.

---

## 6. Tareas

### Crear una tarea

1. Desde un proyecto, haz clic en la pestaña **Tareas**
2. Clic en **Nueva tarea**
3. Completa: título, descripción, responsable, fecha límite, prioridad
4. Clic en **Guardar**

### Estados de tarea

| Estado | Descripción |
|---|---|
| Pendiente | Aún no iniciada |
| En progreso | En ejecución |
| Completada | Finalizada (fecha completada registrada automáticamente) |

---

## 7. Gastos

1. Menú lateral → **Gastos** → **Nuevo gasto**
2. Completa: descripción, monto, fecha, categoría, proveedor (opcional), proyecto asociado
3. Puedes adjuntar recibo o factura como archivo
4. Clic en **Guardar**

**Categorías disponibles:** Materiales, Mano de obra, Transporte, Equipos, Servicios, Otros.

---

## 8. Pagos

1. Menú lateral → **Pagos** → **Nuevo pago**
2. Selecciona cliente, monto, fecha, método de pago
3. Vincula el pago a un proyecto o cotización si corresponde
4. Clic en **Guardar**

**Métodos de pago:** Efectivo, Transferencia, Cheque, Tarjeta.

---

## 9. Proveedores

1. Menú lateral → **Proveedores** → **Nuevo proveedor**
2. Completa: nombre, RNC, contacto, teléfono, correo, categoría de productos/servicios
3. Clic en **Guardar**

Los proveedores pueden vincularse a gastos para llevar un control por suplidor.

---

## 10. Colaboradores

1. Menú lateral → **Colaboradores** → **Nuevo colaborador**
2. Completa: nombre, cédula, posición, teléfono, tarifa diaria
3. Clic en **Guardar**

Los colaboradores son los técnicos y empleados de campo. Se les puede crear un usuario del sistema para que accedan al ERP y a la app móvil.

---

## 11. Inventario

1. Menú lateral → **Inventario** → **Nuevo ítem**
2. Completa: nombre, SKU, categoría (Material / Equipo / Herramienta), descripción, cantidad, unidad
3. Clic en **Guardar**

---

## 12. Archivos

Los archivos se organizan automáticamente por cliente y proyecto.

- Desde el detalle de un proyecto, haz clic en **Archivos**
- Clic en **Subir archivo**
- Formatos permitidos: PDF, JPG, PNG, WEBP (máx. 10 MB por archivo)
- Los archivos también quedan accesibles desde Nextcloud

---

## 13. Fichas técnicas

Las fichas son creadas desde la **app móvil** por los técnicos en campo. Desde el ERP puedes:

- Ver todas las fichas (menú lateral → **Fichas**)
- Filtrar por proyecto, técnico, fecha y estado
- Descargar el PDF de cada ficha
- Los estados son: **Borrador → En progreso → Enviada**

---

## 14. Reportes

1. Menú lateral → **Reportes**
2. Disponibles:
   - **Dashboard ejecutivo:** resumen general (proyectos activos, cotizaciones pendientes, ingresos del mes)
   - **Resumen de proyecto:** desglose de gastos, tareas y pagos de un proyecto específico
   - **Balance de cliente:** historial de cotizaciones y pagos por cliente

---

## 15. Configuración del sistema (solo ADMIN)

1. Menú lateral → **Configuración**
2. Aquí puedes actualizar:
   - Nombre y logo de la empresa
   - Términos y condiciones de cotizaciones
3. Menú lateral → **Usuarios** → gestionar roles y contraseñas del equipo

---

## Consejos rápidos

- **Buscar:** Usa la barra de búsqueda en la parte superior para encontrar clientes, proyectos o cotizaciones rápidamente.
- **Refrescar datos:** Si ves información desactualizada, recarga la página (F5).
- **Soporte:** Contacta al administrador del sistema si olvidas tu contraseña o necesitas permisos adicionales.
