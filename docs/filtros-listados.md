# Filtros y tarjetas de los listados del ERP (2026-10-11)

Reglas que deben cumplir todas las pantallas con filtros. Nacieron de un fallo en **Gastos**: al elegir un cliente, el selector de proyectos seguía mostrando todos y la tarjeta "Este mes" no cambiaba.

## Reglas

1. **Los filtros dependientes se acotan entre sí.** Con un cliente elegido, el selector de proyectos ofrece solo los de ese cliente. Si se cambia de cliente y el proyecto elegido ya no le pertenece, ese filtro se quita solo.
2. **Las tarjetas de resumen cuentan todo lo filtrado**, no solo las filas de la página visible (que son 20). Las cifras las calcula el servidor con los mismos filtros y viaja en `summary` junto a `data` y `total`.
3. **Las tarjetas "de un período" respetan todos los filtros menos las fechas.** "Este mes" en Gastos ya es un período, así que ignora Desde/Hasta pero sí aplica cliente, proyecto, gastos generales y categoría.
4. **Gastos generales** (sin proyecto) no tienen cliente: elegir un cliente quita "Gastos generales" y oculta esa opción del selector de proyectos.

## Qué se corrigió

| Pantalla | Problema | Arreglo |
|---|---|---|
| Gastos | Proyectos sin acotar por cliente; "Este mes" solo respetaba la categoría | Selector acotado (`filtros-gastos.tsx`); `GET /expenses/summary` acepta `clientId`, `projectId`, `general` y `category` (`sumThisMonth`) |
| Tareas | Proyectos sin acotar por cliente; tarjetas contaban solo la página | Selector acotado; `GET /tasks` devuelve `summary {pending, inProgress, done, overdue, urgent}` |
| Fichas | Proyectos sin acotar por cliente | Selector acotado |
| Cobros | Montos recibido/pendiente y fallidos sumaban solo la página | `GET /payments` devuelve `summary {received, pending, failedCount}` |
| Cotizaciones | Monto aprobado/pendiente sumaba solo la página | `GET /quotes` devuelve `summary {approved, sent}` |
| Proyectos | Conteo por estado solo de la página | `GET /projects` devuelve `summary {byStatus}` |

Ya funcionaban bien: Facturas emitidas (proyectos acotados por cliente) y Facturas recibidas / Gastos (`totalAmount` filtrado desde antes).

## Cómo está hecho

- **Backend:** tras `getManyAndCount()`, el servicio clona el query ya filtrado y con permisos aplicados (`qb.clone().orderBy().skip(undefined).take(undefined)`), cambia el `select` y agrupa. Así el resumen respeta exactamente los mismos filtros y el mismo alcance por rol que la lista.
- **Frontend:** cada página usa `summary` si viene y, si no (API vieja), cae al cálculo con la página.
- **Selector acotado:** `visibleProjects` + `setClient()` en `components/{gastos,tareas,fichas}/filtros-*.tsx`.

## Al agregar un listado nuevo

Si tiene tarjetas de resumen, calcularlas en el servicio con el mismo query filtrado; si tiene cliente y proyecto, copiar el patrón `visibleProjects` / `setClient`.

## Pendiente de verificar

Se compiló y desplegó sin errores y la API arrancó bien, pero no se probó con datos reales en pantalla (no hay sesión de prueba activa). Conviene revisar: elegir un cliente en Gastos y comprobar proyectos y "Este mes"; y las tarjetas de Tareas, Cobros, Cotizaciones y Proyectos con una segunda página de resultados.

## Filtros con buscador (2026-10-11)

- **`components/ui/select-buscable.tsx` (`SelectBuscable`)** reemplaza al `Select` en todos los filtros de listados (`filtros-*.tsx`, Facturas recibidas/emitidas y el selector de Reportes). Usa las mismas opciones `<SelectItem>`; cuando la lista tiene **más de 6 opciones** (clientes, proyectos, proveedores, colaboradores…) se vuelve un buscador (`BuscadorSelect`: se escribe y la lista se filtra). Las listas cortas (estados, categorías) siguen siendo un desplegable normal para no abrir el teclado del celular sin necesidad.
- **Nuevo gasto:** tiene un selector **Cliente** (con buscador) que acota la lista de **Proyectos**, también con buscador. El cliente solo ayuda a encontrar el proyecto; no se guarda en el gasto. Elegir un cliente quita "gasto general" y vacía el proyecto si no es suyo.
- Para un filtro nuevo: usar `SelectBuscable` con sus `SelectItem` (el script `conv_select.py` convirtió los existentes).
