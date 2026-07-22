# Manual de Usuario — App Móvil STP Tecnicos

**Aplicación:** STP Tecnicos  
**Plataforma:** Android  
**Requisito para sincronizar:** Estar conectado a la red Wi-Fi de la oficina o al VPN

---

## 1. Instalación

1. En la tablet/teléfono, abre el administrador de archivos
2. Localiza el archivo **build-1782704686444.apk**
3. Toca el archivo y sigue las instrucciones para instalar
4. Si aparece "Origen desconocido", ve a **Configuración → Seguridad → Instalar apps desconocidas** y actívalo para el administrador de archivos
5. Una vez instalada, la app aparece como **STP Tecnicos** en el menú de aplicaciones

---

## 2. Inicio de sesión

1. Abre la app **STP Tecnicos**
2. Ingresa tu **correo electrónico** y **contraseña** (los mismos del ERP)
3. Toca **Iniciar sesión**

**Mensajes de error comunes:**

| Error | Causa | Solución |
|---|---|---|
| "No se pudo conectar al servidor" | Sin conexión a la red de STP o VPN desactivado | Conéctate al Wi-Fi de la oficina o activa el VPN |
| "Correo o contraseña incorrectos" | Credenciales inválidas | Verifica los datos o contacta al administrador |

---

## 3. Pantalla de Proyectos

Al iniciar sesión llegas a la pantalla principal con todos tus **proyectos activos**.

- El saludo en la parte superior muestra tu nombre y la cantidad de proyectos
- Cada tarjeta muestra: **código**, **tipo** (con color distintivo), **nombre**, **ubicación** y **cliente**

**Colores por tipo de proyecto:**

| Color | Tipo |
|---|---|
| 🟡 Amarillo | Eléctrico |
| 🟢 Verde | Mecánico |
| 🔴 Rojo | Construcción |
| 🟣 Morado | Mantenimiento |

- Toca una tarjeta para ver las **fichas técnicas** de ese proyecto
- Desliza hacia abajo para **refrescar** la lista

### Notificaciones en pantalla

- **Sin conexión** (rojo): Trabajando offline. Los cambios se guardan localmente.
- **Sincronizando** (azul, icono girando): Enviando fichas pendientes al servidor.
- **Fichas pendientes** (amarillo): Hay fichas sin sincronizar. Toca **"Enviar ahora"** cuando tengas conexión.

---

## 4. Fichas Técnicas

### Ver fichas de un proyecto

1. Desde la pantalla de proyectos, toca una tarjeta
2. Verás la lista de fichas del proyecto, organizadas por estado

**Colores por estado:**

| Color | Estado |
|---|---|
| 🟡 Amarillo | Borrador |
| 🔵 Azul | En progreso |
| 🟢 Verde | Enviada |

### Crear una ficha nueva

1. En la pantalla de fichas, toca el botón **"+"** (azul, esquina inferior derecha)
2. Selecciona el **tipo de ficha:**
   - Eléctrico
   - Civil
   - Electromecánico
   - Levantamiento
   - Evaluación de daños
3. La ficha se crea como **Borrador** y se asigna un código (FT-YYYY-NNN)

---

## 5. Llenado de fichas (5 pasos)

La ficha se completa en 5 pasos. Puedes avanzar y retroceder entre pasos.

### Paso 1 — Información general

- Título de la ficha
- Fecha de visita
- Técnico responsable (se llena automáticamente con tu usuario)

### Paso 2 — Datos técnicos

- Campos específicos según el tipo de ficha seleccionado
- Opciones de selección múltiple (toca para activar/desactivar)
- Campos de sí/no con toggle
- Campos de texto libre para observaciones

### Paso 3 — Materiales e ítems

- Agrega materiales o equipos usados
- Toca **"Agregar ítem"** y completa la descripción y cantidad
- Para eliminar un ítem, toca el ícono **✕** a su derecha

### Paso 4 — Fotos

- Toca **"Tomar foto"** para usar la cámara del dispositivo
- O toca **"Galería"** para seleccionar fotos existentes
- Puedes agregar varias fotos por ficha

### Paso 5 — Firma y envío

- Firma directamente en la pantalla con el dedo
- Toca **"Limpiar"** si necesitas repetir la firma
- Toca **"Guardar borrador"** para guardar sin enviar
- Toca **"Enviar ficha"** para marcarla como enviada y sincronizarla con el servidor

---

## 6. Modo offline

La app funciona **sin conexión a internet**. Si no tienes Wi-Fi o VPN:

- Puedes crear y llenar fichas normalmente
- Las fichas se guardan en el dispositivo
- Cuando recuperes la conexión, la app sincroniza automáticamente

El **banner amarillo** en la pantalla de proyectos indica cuántas fichas están pendientes de envío. Puedes tocar **"Enviar ahora"** para forzar la sincronización.

---

## 7. Perfil

Toca el ícono **Perfil** en la barra de navegación inferior.

Aquí puedes ver:
- Tu nombre y correo
- Tu rol en el sistema
- La versión de la app

Para cerrar sesión, desplázate hasta el final y toca **Cerrar sesión**.

---

## 8. Navegación

La barra inferior tiene tres secciones:

| Ícono | Pantalla |
|---|---|
| 📁 Proyectos | Lista de proyectos activos |
| 👤 Perfil | Tu información y cerrar sesión |

Las fichas técnicas se acceden desde cada proyecto (no desde la barra inferior).

---

## Consejos

- **Batería:** El modo offline usa más batería por guardar datos localmente. Carga el dispositivo antes de una visita larga.
- **Fotos:** Toma fotos con buena iluminación. Se comprimen automáticamente antes de enviarse.
- **Firma:** Firma con el dedo usando un trazo lento y deliberado para mejor calidad.
- **Conexión:** Siempre verifica que el banner de "Sin conexión" no esté visible antes de marcar una ficha como enviada.
