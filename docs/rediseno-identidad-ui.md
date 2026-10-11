# STP ERP — Rediseño de identidad y navegación (2026-10-11)

Documento de referencia del design system. Código: `stp-landing` (Next 16, Tailwind 4, shadcn sobre Base UI, Geist).

## 1. Diagnóstico (Fase 1)

| Pieza | Estado inicial | Decisión |
|---|---|---|
| Tokens (navy `#0D3773` + verde `#157B52` del logo, claro/oscuro) | Sólidos, migrados el 14/09 | Reutilizar |
| `components/ui/*` (botón, input, tabla, diálogo, sheet, sidebar) | Coherentes | Reutilizar y afinar |
| Login | Tarjeta centrada genérica | Rediseñar |
| `/dashboard` | 4 KPIs + 5 gráficas ("dashboard genérico") | Reubicar en `/dashboard/resumen` |
| Menú lateral | 8 grupos, sin acceso rápido ni búsqueda de módulos | Reorganizar sobre una fuente única |
| Header | Título, búsqueda, campana, avatar; sin migas ni tema | Ampliar |
| Móvil | Sidebar tipo Sheet; listados ya responsive; controles de 32 px | Barra inferior + objetivos táctiles |
| Avisos | Ninguno: toda acción exitosa era silenciosa | Sistema de avisos |
| Estados vacíos | ~20 textos "No hay…" sueltos | Componente único con acción |
| Ordenamiento | No existía | Por columna, servidor + URL |

Brecha de marca: no existe ninguna foto de proyectos de STP en Drive ni en el servidor. El héroe usa una imagen institucional del sitio público de la empresa (`stpsoluciones.com/assets/obra.jpg`) y es reemplazable desde Configuración.

## 2. Dirección visual (Fase 2): "plano técnico"

- Navy profundo (`--brand-deep`) con retícula de plano y la línea del techo del logotipo como motivo (`components/brand/blueprint.tsx`).
- Verde (`--brand-green`, `--brand-green-soft`) solo como acento y para estados de éxito.
- Geist; etiquetas de sección en mono, mayúsculas, con tracking amplio; cifras tabulares.
- Radios de 10 px; sin sombras decorativas (solo en avisos y menús flotantes).
- Estados: éxito = verde de marca, error = `destructive`, advertencia = ámbar, información = primario.

## 3. Pantallas definidas (sección 13 del pedido)

1. **Login / restablecer:** `components/auth/auth-shell.tsx`. Escritorio dividido (marca | formulario); móvil con banda de marca compacta y formulario arriba.
2. **Inicio:** héroe con imagen + saludo, avisos de vencidos, accesos frecuentes y módulos por área (filtrados por permisos).
3. **Navegación:** barra superior (migas, búsqueda con Ctrl+K, tema, notificaciones, perfil) + menú lateral; barra inferior en móvil.
4. **Pantalla interna representativa:** Proyectos (cabecera, `StatCard`, filtros, tabla ordenable, `TableEmpty`).
5. **Móvil:** barra inferior (Inicio + 3 módulos de uso diario + Menú), objetivos de 40 px, campos de 16 px.

## 4. Piezas reutilizables

| Pieza | Archivo | Uso |
|---|---|---|
| Menú (fuente única) | `lib/nav.ts` | Agregar un módulo = una entrada con `description` y `module`; lo toman menú, Inicio, búsqueda, migas y barra inferior |
| Avisos | `lib/toast.ts`, `ui/toaster.tsx` | `toast.success/error/warning/info/loading` |
| Estado vacío | `ui/empty-state.tsx` | `TableEmpty` (con `filtered` y `action`) |
| Indicador | `ui/stat-card.tsx` | Contadores de cabecera de listados |
| Cabecera ordenable | `ui/sort-head.tsx` | `?sort=campo&dir=asc|desc`; el backend valida con lista blanca (`common/sort.ts`) |
| Tema | `lib/theme.ts`, `layout/theme-toggle.tsx` | Clase `dark` en `<html>`, guardada en `localStorage` |
| Imagen destacada | `settings/hero-upload.tsx` + `GET/POST/DELETE /settings/hero` | Solo ADMIN escribe |

Reglas: botones/campos/selects suben a 40 px solo por debajo de `md`; en celular todo campo de texto va a 16 px (evita el zoom de iOS).

## 5. Qué ve cada rol (verificado contra `module-permissions.ts`)

| Rol | Entradas | No ve |
|---|---|---|
| Administrador | 22 | — |
| Gerente | 17 | Facturas emitidas, Facturas recibidas, Nómina, Usuarios, Configuración |
| Finanzas | 16 | Cronograma, Tareas, Fichas de campo, Inventario, Usuarios, Configuración |
| Usuario | 9 | Resumen, Cotizaciones, Facturas emitidas, Cobros, Proveedores, Facturas recibidas, Gastos, Costos, Nómina, Reportes, Colaboradores, Usuarios, Configuración |

El Resumen exige el módulo Reportes (sus datos salen de `/reports`).

## 6. Verificación móvil

- **Emulación web** (iPhone 14, iPhone SE a 320 px, Pixel 7) con la sesión real: sin desbordes horizontales, `viewport-fit=cover`, `theme-color`, manifest y `apple-touch-icon` presentes, controles del header y del menú >= 40 px, ningún campo bajo 16 px.
- **Android real (emulador de Android Studio, Pixel 7, Android 16, Chrome y teclado Gboard):** login con la marca y el formulario correctos; con el teclado abierto el formulario se desplaza y el botón "Iniciar sesión" queda visible. La prueba encontró un fallo: en el diálogo de recuperar contraseña los botones quedaban tapados por el teclado. Se corrigió con `interactiveWidget: "resizes-content"` y diálogos anclados arriba en móvil (`max-md:top-3`); se repitió la prueba y los botones quedan visibles.
- **iOS (motor WebKit/Safari real vía Playwright, perfiles iPhone 14 y iPhone SE):** login sin desbordes, campos a 16 px (no hay zoom al enfocar), botón principal de 44 px y el diálogo de recuperar contraseña anclado arriba con "Enviar enlace" y "Cancelar" visibles.
- **Pendiente:** un iPhone físico (teclado de iOS real y área segura de la muesca); en Windows no existe simulador de iOS.
