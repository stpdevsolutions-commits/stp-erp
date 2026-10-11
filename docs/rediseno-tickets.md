# STP Tickets — Rediseño de identidad y navegación (2026-10-11)

Mismo sistema de diseño que el ERP ("plano técnico", ver `rediseno-identidad-ui.md`). Código: `stp-tickets-web` (Next 16, Tailwind 4, shadcn sobre Base UI, Geist).

## 1. Diagnóstico (Fase 1)

| Pieza | Estado inicial | Decisión |
|---|---|---|
| Tipografía | `--font-sans` autorreferenciado en `globals.css`: todo el sitio renderizaba en **Times New Roman** | Corregido (mismo bug que tuvo el ERP) |
| Tokens (navy + verde del logo, claro/oscuro) | Sólidos, sin selector de tema visible | Reutilizar; añadir selector |
| Navegación | Header con dos enlaces ("Tickets", "Roadmap"); sin menú lateral, sin migas, sin búsqueda global | Barra lateral + header + barra inferior móvil |
| Inicio | La lista de tickets era la portada | Inicio nuevo (centro de operaciones); la lista pasa a `/tickets` |
| Lista de tickets | Sin indicadores; vacío como texto suelto; tabla con 8 columnas fijas | `StatCard`, `TableEmpty`, columnas responsive |
| Avisos | Ninguno tras crear/editar/borrar | Sistema de avisos |
| Móvil | Header de escritorio y tabla comprimida | Barra inferior, controles de 40 px, campos de 16 px, diálogos arriba |
| Login | **No existe**: el acceso está gateado por red (Caddy `remote_ip`: VPN/LAN) | Fase 3 no aplica |

## 2. Qué se construyó

- **Inicio (`/`):** héroe con la imagen institucional de STP, saludo, aviso de urgentes y en revisión, contador de abiertos, botón Nuevo ticket, y tres tarjetas: Trabajo (Tickets, Roadmap), Proyectos (con abiertos por proyecto, enlazan a su lista) y Actividad reciente.
- **Navegación (`lib/nav.ts`, fuente única):** barra lateral con Inicio, Trabajo y los **proyectos reales** con su conteo de abiertos; migas (Trabajo › Tickets › Ticket); búsqueda global (Ctrl+K) de secciones y tickets por código o título; selector de tema claro/oscuro; barra inferior en móvil.
- **Tickets (`/tickets`):** indicadores (pendientes, en curso, en revisión, resueltos), filtros que se recuerdan entre visitas, y enlaces con filtros por URL (`?project=`, `?status=`, `?sort=`). El enlace "Tickets" del menú (`?all=1`) muestra todo.
- **Piezas compartidas con el ERP:** `lib/toast.ts` + `ui/toaster.tsx`, `ui/empty-state.tsx`, `ui/stat-card.tsx`, `components/brand/blueprint.tsx`, `lib/theme.ts`, `ui/sidebar.tsx`.
- **Móvil:** objetivos táctiles de 40 px solo bajo `md`, campos de 16 px (sin zoom en iOS), `interactiveWidget: resizes-content` y diálogos anclados arriba para que el teclado no tape los botones.
- **Avisos cableados:** crear/editar/eliminar ticket, comentar, crear/editar/eliminar etapa, cambiar el estado de una etapa y asignar un ticket a una etapa.

## 3. Verificación

- Escritorio, tema oscuro y móvil con el sitio real; filtros por proyecto, enlace de urgentes y búsqueda comprobados.
- **WebKit (iPhone 14 / SE):** sin desbordes y campos a 16 px. Se encontró y corrigió un fallo de hidratación causado por un `Suspense` alrededor de la barra lateral.
- **Android real (emulador de Android Studio, Pixel 7, Chrome y Gboard):** el sitio carga y la barra inferior es opaca. Con el teclado abierto, el campo "Descripción" de "Nuevo ticket" quedaba tapado; se corrigió centrando el campo enfocado dentro del diálogo (`scrollIntoView` en `ui/dialog.tsx`, también aplicado al ERP) y se repitió la prueba: el texto se ve y "Crear ticket" / "Cancelar" quedan visibles.
- Lint: 0 errores.
- No se probó en un iPhone físico.
