export interface ProjectMeta {
  /** Para qué sirve el proyecto, en una o dos frases. */
  purpose: string;
  /** Tags cortos de stack técnico. */
  stack: string[];
  /** Párrafo del estado actual — no es lo que dice git, es el contexto real. */
  status: string;
  /** Lo último que se hizo, más reciente primero. Actualizar a mano cuando cambie mucho. */
  recentWork: string[];
  /** Enlaces útiles (app en vivo, panel admin, etc.), opcional. */
  links?: { label: string; url: string }[];
}

/**
 * Ficha técnica de cada proyecto — contenido escrito a mano, no calculado.
 * Git dice la rama y el último commit; esto dice para qué sirve, en qué
 * estado real está y qué se hizo últimamente. Se actualiza cuando cambie algo
 * importante, no en cada commit.
 */
export const PROJECT_META: Record<string, ProjectMeta> = {
  'stp-erp': {
    purpose:
      'ERP interno de STP: proyectos, clientes, cotizaciones, tareas, fichas técnicas de campo, nómina, catálogo de costos/materiales y facturación.',
    stack: ['NestJS', 'TypeORM', 'PostgreSQL', 'Next.js', 'Docker', 'Caddy'],
    status:
      'En producción, uso diario del equipo. Base de todo lo demás: la app móvil de técnicos, el catálogo de descargas y Vigía mismo viven en el mismo servidor y comparten esta infraestructura.',
    recentWork: [
      '2026-10-11 Rediseño de identidad y navegación ("plano técnico") TERMINADO, desplegado y publicado (98cbee9..dce3780). Login y restablecer con marco de marca; nuevo Inicio (centro de operaciones: héroe con la imagen institucional del sitio de STP, configurable desde Configuración; módulos por área filtrados por permisos; avisos de vencidos; accesos frecuentes) — el Resumen con gráficas pasó a /dashboard/resumen y exige el módulo Reportes; menú de fuente única (lib/nav.ts) con migas, búsqueda de módulos (Ctrl+K), tema claro/oscuro y barra inferior móvil; avisos tras cada acción (70 puntos), estados vacíos con acción para crear, StatCard, ordenamiento por columna en 7 listados (lista blanca en el backend) y controles táctiles de 40 px / campos de 16 px en móvil. Verificado: escritorio, tablet, Android real (emulador con teclado; hallado y corregido que el teclado tapaba los botones de los diálogos), WebKit iPhone 14/SE y el iPhone de Pedro; navegado como gerente, finanzas y usuario con cuentas QA temporales (hoy desactivadas); Configuración cerrada por URL a roles sin permiso. Documento del design system en docs/rediseno-identidad-ui.md.',
      '2026-10-11 Ajustes del ERP pedidos por Pedro (commits 6986804 y c7af935, publicados): lector de QR de facturas más fiable en celular (cámara a 1920x1080, detector nativo del sistema en Android, enfoque continuo y botón de flash donde el navegador lo permite; en iPhone no hay flash); calculadora fiscal de FiscoRD traída al formulario de facturas recibidas (Desde base, Desde total, Transcribir; un QR abre Transcribir); filtros agrupados tras un botón Filtros en celular en 9 listados, con fechas que conservan el valor y etiqueta Desde/Hasta; pestañas de Costos y de proyecto y botones de encabezado sin desplazamiento lateral. Sin probar en pantalla real con sesión.',
      '2026-10-11 Unidades Transporte y PA añadidas al selector de unidad de las cotizaciones (editor de partidas, nueva cotización y editar cotización) y del inventario; la unidad es texto libre, sin cambios de backend. Commit e1551d1. Mismo día: el rediseño de identidad se aplicó también a STP Tickets (commit 54d7a0c).',
      '2026-10-11 STP Facturas completo en el ERP: facturas recibidas (escaneo con IA Claude, validación DGII, 606), emitidas e-CF con notas de crédito, PDF con formato DGII y QR, y ERP-50 (vincular una factura con un gasto registrado a mano + pantalla Conciliar; sin duplicar gastos). Todo en git (c19b24e). FiscoRD apagado (FRD-50); sus datos viven aquí.',
      'Mejoras 2026-10-02: cobros vencidos (fecha "Vence" en pagos pendientes, aviso diario y en el Resumen); tareas programadas en hora de RD (antes corrían 4 horas antes); script que rehace en bloque los PDF de cotizaciones y pagos; tarifa real por colaborador (día, m², ml o partida); recibo de pago con el e-CF; el menú muestra a cada rol solo lo que puede abrir (Finanzas veía módulos con error y no veía Nómina); tests de cartera, nómina y fechas; lint en cero; todas las pantallas legibles en celular.',
      'Ronda de pulido (2026-10-01): cartera por cobrar calculada por proyecto (antes decía 100% cobrado con datos que no cuadraban); gastos de nómina con el nombre del colaborador (corregidos los existentes); validación de días contra el período; "hoy" en hora de RD en todo el backend (desde las 8 pm se pasaba al día siguiente) y fechas sin salto de un día en el frontend; detalle de proyecto con resumen económico y asignados; mensajes de validación en español; PDFs de cotización/pago/nómina corregidos (signo menos, partidas que no se parten, firmas, nombres de archivo); todas las listas legibles en celular. Commits fc9891d..e6b30f2, pusheados.',
      'ERP-110 (2026-09-28): el ERP ya emite e-CF llamando a ecf-api por HTTP (API-key de servicio). Payment con campos ecf*, endpoint POST /payments/:id/emitir-ecf, migracion aplicada. Probado en TesteCF (crear->validar->firmar, eNCF E320000000003). Falta UI en Pagos y transmision real (habilitacion DGII).',
      'Importar precios (Costos) rehecho para que no se trabe: emparejamiento nuevo con sinónimos (alambre = cable) y sin ruido de colores/"o similar" (SUPLYMATEC pasó de 0 a 40 renglones asignados solos), sugerencias con un clic, "Crear materiales faltantes" desde la cotización con categoría detectada automáticamente, "Volver a leer con IA" y explicación cuando el PDF no trae precios. 8 categorías de construcción nuevas (Drywall, Tornillería, Cemento, Acero, Pinturas, Madera, Plafones, Pisos) y revisión de los 231 materiales del catálogo.',
      'Backend de la calculadora de materiales de la app (material-calcs): cálculos guardados por proyecto, precios del catálogo y PDF con membrete archivado en los documentos del proyecto.',
      'Login con Google de la app de técnicos arreglado (el backend rechazaba el cliente Android desde la auditoría del 15/9).',
      'Git al día: el rediseño ERP-83..109 estaba en producción sin commitear desde el 20/9; subido y verificado que compila. Fix de "Failed to find Server Action" tras cada despliegue (deploymentId + aviso "Recargar").',
      'Infraestructura del servidor: backup diario COMPLETO (las 10 bases de datos, fotos de Immich, configs, secretos cifrados con GPG, _eliminados/ 30 días, aviso Telegram); Mi Día y eCF públicos por Cloudflare Tunnel (la IP de la casa cambió); DNS de la VPN y red IPv4 recuperados tras una sobrecarga; revisión de hardware (discos sanos, sin UPS: 7 cortes bruscos en septiembre).',
      'Creado ERP-110 (deferred, sin agendar): integrar la facturación e-CF (proyecto eCF-SaaS, separado) al ERP — hoy son dos sistemas totalmente desacoplados (bases de datos, auth y dominios distintos). Revisando eCF-SaaS para armar el ticket se encontró que está más avanzado de lo registrado: desde el 17/8 tiene un certificado real de un PSC (Viafirma) cargado en producción, pero sin ninguna transmisión real probada contra el ambiente de prueba de la DGII todavía (los únicos comprobantes "transmitidos" en su base son de antes del certificado y están marcados como simulados). Enfoque propuesto para cuando se retome: el ERP llamando por HTTP al servicio de eCF-SaaS cuando un Pago/Cotización necesite un comprobante real, mismo patrón que otros servicios externos ya conectados (WhatsApp, Vigía) — sin fusionar bases de datos.',
      'Rediseño funcional del ERP TERMINADO POR COMPLETO — los últimos 2 deferred (ERP-108, ERP-109) resueltos, cero tickets pendientes en STP Tickets. ERP-108 (Manager veía Gastos de cualquier proyecto sin estar asignado): se le excluyó puntualmente de la lista de roles sin restricciones solo para Gastos, vía un mecanismo nuevo y genérico (no cambia su acceso a ningún otro módulo). En el camino se encontró y corrigió un bug real: la función que arma el filtro de listados volvía a comprobar "es rol sin restricciones" por su cuenta e ignoraba la exclusión puntual, así que el listado de Gastos seguía sin acotarse aunque el resto ya funcionaba. Verificado en vivo con una cuenta de prueba temporal. ERP-109 (user no podía subir archivos): resultó que ya podía — la matriz se había actualizado en algún punto sin que se revisara el ticket. El problema real era otro: ese mismo permiso también le daba a user poder BORRAR cualquier archivo de su alcance, cosa que nunca se quiso. Se separaron "puede subir" de "puede administrar/borrar" con un nivel de permiso nuevo. Verificado en vivo: subir sigue funcionando, borrar ahora da error de permiso.',
      'Corregido ERP-86/87: habían quedado marcados como completos en el roadmap sin estarlo (detectado en un barrido final de status). El ticket original pedía eliminar el panel de Accesos de Cliente/Proyecto, pero hacerlo habría dejado al rol `user` sin forma de ver nada en esos módulos (siguen exigiendo pertenencia además de permiso de módulo). Se escaló a Pedro en vez de decidir sola; su instrucción fue moverlo al diálogo de Editar en lugar de eliminarlo — implementado así (solo ADMIN, solo en el diálogo abierto desde la ficha de detalle, no desde los listados) y verificado en vivo agregando/quitando un miembro real.',
      'Rediseño funcional del ERP — 5 sprints, ERP-83 a ERP-109: matriz de permisos por rol×módulo (nuevo rol Finanza) en los 18 controladores; cambios de esquema en Inventario (estado de ubicación estructurado), Colaboradores (tipo + código correlativo) y Nómina (préstamos con descuento automático); reorganización de menús (Cotizaciones y Nómina a Finanzas, Archivos de cliente a página propia); filtros por cliente/proyecto en Cotizaciones/Pagos/Gastos/Tareas/Fichas, páginas de detalle nuevas para Gastos y Tareas, bug real corregido en Reportes (pestañas Proyecto/Cliente no mostraban su selector), nuevo reporte de Nómina; motor de búsqueda global (clientes/proyectos/cotizaciones/tareas/archivos/colaboradores, respeta permisos por rol) y motor de notificaciones in-app (tarea asignada, cotización aprobada/rechazada, pago recibido) reemplazando los dos placeholders del header.',
      'Identidad visual completada: la causa raíz de que nada se pareciera al mockup era que `--font-sans` en globals.css se referenciaba a sí mismo, así que todo el ERP renderizaba en Times New Roman en vez de Geist — corregido. Junto con eso, tabla (`table.tsx`) y tarjeta (`card.tsx`) compartidas tenían densidad/sombra genéricas de plantilla, corregidas para que coincidan con el mockup. Se agregó un header real (título por pantalla, avatar, búsqueda/campana marcadas "Próximamente"). Los 16 módulos restantes se auditaron en paralelo con agentes campo-por-campo y pantalla-por-pantalla contra sus mockups (no solo nombres de campos): se corrigieron bugs reales (colSpan desalineado en Clientes, filtros nativos sin estilo en Fichas de campo, navegación inconsistente entre las 4 vistas de Costos, badges sólidos genéricos en vez del tinte suave en Usuarios/Mi perfil/Colaboradores, Reportes que cargaba vacío en vez del reporte general por defecto) y se tomaron 3 decisiones de producto (Pagos: tarjetas de métricas; Colaboradores: filtro de estado agregado; Fichas de campo: sin botón "+ Nueva ficha" porque solo se crean desde la app móvil). Lección aprendida: en migraciones de identidad, verificar con captura real + `getComputedStyle`, nunca solo leyendo el código de los componentes.',
      'Primer lote de identidad visual: mockups de las 18 pantallas validados campo por campo contra el código real, luego migrado a producción — diálogos de alta/edición (Cliente, Proyecto, Tarea, Colaborador, Proveedor, Material, ACU, Ítem, Gasto, Pago, Usuario, Unidad) más anchos y con secciones en vez de sentirse apretados; arreglado un bug real en el Select compartido (texto largo se cortaba en vez de envolver, afectaba ~44 formularios); sidebar con tarjeta de cuenta (avatar, nombre, rol) en vez de solo "Cerrar sesión". Proyectos ganó de paso los campos Supervisor (colaborador) y Encargado (usuario).',
      'WhatsApp de asignación de tareas migrado a la API oficial de Meta (Cloud API) — número real conectado, token permanente, webhook de estado, plantilla "tarea_asignada" aprobada y confirmada de punta a punta. Se abandonó del todo el puente no oficial (Baileys) por un problema real de la librería, no de configuración.',
      'STP Tickets (sistema propio de bugs/cambios/mejoras): número de reporte correlativo por ticket, y ahora conectado a Hermes Agent vía MCP — se puede crear/consultar tickets por chat de Telegram.',
      'Cotizaciones: el ITBIS de gastos indirectos ahora es removible y con base elegible (gravables o total de la factura) — antes quedaba fijo en "Dirección Técnica" sin poder quitarse.',
      'Login con Google y reestructuración de fichas (Domótica separada de Levantamiento) en la app móvil.',
    ],
    links: [{ label: 'ERP', url: 'https://erp.stpsoluciones.com' }],
  },
  'stp-mobile': {
    purpose:
      'App móvil para los técnicos de campo de STP: llenar fichas técnicas (eléctrico, civil, electromecánico, levantamiento, domótica, evaluación de daños) desde el sitio, con fotos, firma y GPS, y calculadora de materiales con cuadrilla y días de trabajo.',
    stack: ['Expo', 'React Native', 'TypeScript', 'expo-router', 'EAS Update'],
    status:
      'Nativa, con actualizaciones OTA (la APK del 24/9 en apk.stpsoluciones.com ya las trae). Calculadora de materiales (MOB-1) completa: 9 calculadoras, enlazada a proyectos, precios del catálogo del ERP y PDF. Pendiente: que Pedro revise los coeficientes y cargar al catálogo los materiales de albañilería para que salgan con precio.',
    recentWork: [
      'Mejoras 2026-10-02 (OTA production, update 56bab218): abrir la app SIN senal ya no cierra la sesion (antes borraba los tokens) y un corte de red al renovar el token tampoco; la cola offline ya no pierde la ficha guardada mientras se sincroniza, no descarta en silencio las fotos que fallan al subir y no duplica la ficha si falla el envio; cola danada se respalda. Sin probar aun en un telefono.',
      'fix(calc/ceramica 2026-09-28): claves ceramica_33.3x33.3 (pieza personalizada con decimales) fallaban la validación del servidor; aId/bId sanitizan el punto decimal → ceramica_33_3x33_3. Publicado por OTA (update 1c030290).',
      'fix(calc/sheetrock 2026-09-28): claves paral_3-5/8 y canal_3-5/8 fallaban la validación del servidor (regex [a-z0-9_]); ahora se sanitiza el perfil antes de usarlo en la clave (paral_3_5_8). Bloqueaba el guardado y el enlace de materiales en calculadoras Sheetrock con perfil 3-5/8 o 2-1/2. Publicado por OTA (update 23714946).',
      'MOB-112 (2026-09-28): en las calculadoras, los huecos ahora se agregan de distintos tamanos (ancho x alto x cantidad, un muro con varias puertas/ventanas) en vez de un solo numero. Publicado por OTA a produccion.',
      'Calculadora conectada al ERP: cada cálculo se enlaza a un proyecto, la lista de materiales sale con precios vigentes del catálogo ("Poner precio" enlaza un insumo una vez para todos) y "Guardar en el proyecto y generar PDF" archiva el PDF con membrete en los documentos del proyecto. Publicado por OTA.',
      'Login con Google arreglado: faltaba aceptar el cliente Android en el backend y el SHA-1 del cliente OAuth en Google Cloud era el de la llave debug (cambiado al de Expo).',
      'Calculadora de materiales (MOB-1): pestaña nueva con 9 calculadoras — muro de block (mortero, relleno de celdas, varilla, pañete), mortero, hormigón f\'c 180-300, losa (encofrado, puntales, recubrimiento), sheetrock/Densglass, plafón 2x2/2x4, cerámica, pintura y eléctrico — todas con cuadrilla y días. Funciona sin conexión; coeficientes centralizados en lib/calc/constantes.ts.',
      'Actualizaciones OTA con EAS Update (plan gratis): aviso "Reiniciar" dentro de la app y versión visible en Perfil. APK compilada en local en el servidor (no gasta cupo de EAS Build), solo ARM: 61 MB en vez de 107 MB.',
      'Firma unificada con la llave de Expo: la APK de agosto publicada estaba firmada con la llave debug, así que quien la tenga debe sincronizar, desinstalar e instalar una sola vez (aviso en la página de descargas).',
      'Corregido el redirect_uri del login con Google (Error 400 invalid_request de Meta).',
      'Levantamiento general separado de Domótica: puntos eléctricos (cajitas/tomas/interruptores/luminarias) y materiales tomados del catálogo real del ERP.',
      'Nueva ficha de Domótica independiente (conectividad, panel eléctrico, ambientes, cotización).',
    ],
  },
  'ecf-saas': {
    purpose:
      'Facturación electrónica (comprobantes fiscales e-CF) para la DGII — integración real (firma, autenticación/transmisión/estado, QR, RFCE, ANECF) — pensado a futuro como módulo de facturación dentro del ERP de STP.',
    stack: ['NestJS', 'Next.js', 'PostgreSQL', 'Redis'],
    status:
      'main al día — la rama fix/typescript-and-db-config (que parecía "perdida" con 2 meses de atraso) en realidad ya estaba fusionada a main 4 veces; solo el docker-compose.yml y el Dockerfile del frontend le faltaban commitear, y quedaron fusionados el 30 de agosto. El contenedor ya reporta "healthy" de verdad, después de dos causas encontradas y arregladas el mismo día.',
    recentWork: [
      '2026-10-11: transmisión a TesteCF funcionando de punta a punta (autenticación automática con la DGII), XML corregido (totales por tasa, vencimiento de secuencia, notas de crédito), representación impresa con QR y hora de firma correctos (TZ America/Santo_Domingo). Pendiente trámite de Pedro: postular el software ante la DGII (ECF-7); el RNC 132943058 solo está registrado en producción.',
      'Via de servicio por API-key (2026-09-28): ecf-api acepta x-api-key para emision server-to-server, atada a la empresa STP. Con esto el STP ERP ya emite e-CF desde un Pago. Probado en TesteCF; falta habilitacion DGII para transmitir y cert de produccion.',
      'Revisado a fondo para planear su futura integración al ERP (ver ticket ERP-110 en STP Tickets): desde el 17/8 tiene un certificado real de un PSC (Viafirma) cargado en producción (.env), a nombre de Ángel Darío Sánchez — más avanzado de lo que se tenía registrado. Pero no hay evidencia de ninguna transmisión real contra el ambiente de prueba de la DGII: los únicos comprobantes "transmitidos"/"aceptados" en la base son de antes de ese certificado y están marcados como simulados. Falta confirmar si la RNC ya está habilitada como emisor electrónico ante la DGII (tener el certificado del PSC no implica esa habilitación por sí solo). Integración al ERP: no existe todavía, son dos sistemas totalmente separados hoy (bases de datos, autenticación y dominios distintos) — el enfoque propuesto es el ERP llamando por HTTP a este servicio, mismo patrón que WhatsApp/Vigía, sin fusionar bases de datos.',
      'fix: HEALTHCHECK del Dockerfile con wget en vez de "node -e" — levantar un proceso de Node nuevo cada 30s competía por CPU con el resto del servidor y superaba el timeout de 3s aunque la API respondiera bien.',
      'fix: /health y /version excluidos del prefijo global /api (el HEALTHCHECK pegaba a /health sin prefijo y daba 404).',
      'Merge de docker-compose.yml/Dockerfile del frontend a main; rama fix/typescript-and-db-config cerrada y borrada por estar 100% fusionada.',
      'fix: seguridad/consistencia DGII por empresa, tasa de ITBIS seleccionable y rediseño de líneas de detalle.',
      'feat: consulta de comprobantes con filtros avanzados, formulario e-CF completo y logo de empresa.',
      'feat: anulación real de e-CF (ANECF), transmisión RFCE para facturas <RD$250k, integración real con dgii-ecf (firma/auth/transmisión/estado/QR).',
    ],
  },
  'mi-dia': {
    purpose: 'PWA personal de tareas y notas del día a día, con su propio backend — no depende del ERP.',
    stack: ['React', 'PWA', 'API propia', 'PostgreSQL'],
    status: 'En vivo y estable, uso diario. Es la única app deliberadamente pública (sin exigir VPN) porque tiene que abrir desde el celular en cualquier red.',
    recentWork: [
      'feat(proyectos 2026-09-28): nueva pestaña Proyectos en la app — agrupa tareas por proyecto con emoji/color, barra de progreso, lista pendientes/completadas y vista detallada. También migración DB (tabla projects, FK project_id en tasks) y QuickAddModal con selector de proyecto. Backend: CRUD /projects en Express. Commit 935bd6d.',
      'feat(calendar 2026-09-28): eventos de Google Calendar visibles en la vista mensual — dots azules en días con eventos y tarjetas de evento en el panel del día seleccionado. Aviso de reconexión si el token vence.',
      'Repo transferido de la cuenta personal de Pedro (PedroAngSs) a la cuenta de STP (stpdevsolutions-commits) — consolidación de todos los repos bajo una sola cuenta. El deploy key del servidor (usado por el checkout en ~/mi-dia) se conservó intacto en la transferencia; remotes de servidor y PC actualizados y verificados.',
      'Recordatorios con alarma real (DIA-1): Web Push con Service Worker (VAPID) — la notificación suena aunque la PWA esté cerrada, no solo en primer plano. Backend revisa cada 60s las tareas con isReminder vencidas (en hora de RD) y empuja la notificación a todos los dispositivos suscritos.',
      'feat(ui): paleta verde salvia en vez de azul/turquesa.',
    ],
    links: [{ label: 'Mi Día', url: 'https://dia.stpsoluciones.com' }],
  },
  estructuralrd: {
    purpose:
      'Calculadora estructural para ingeniería civil en RD: vigas, columnas, torsión, columna corta, muro especial (§18.10), irregularidades sísmicas.',
    stack: ['React', 'Node.js', 'PostgreSQL', 'nginx'],
    status:
      'Activo. Se unificó con vigacalc-rd (la calculadora standalone anterior) el 29 de agosto, quedando como la única herramienta de cálculo estructural del equipo.',
    recentWork: ['Módulo de Grilla: ejes, tramos por sección, huecos y castillos, con eliminación granular real por ítem.'],
  },
  fiscord: {
    purpose:
      'SaaS de facturación y gestión de NCF/DGII para negocios en RD, con app móvil vía Capacitor — proyecto aparte del servidor de STP.',
    stack: ['React', 'Vite', 'Supabase', 'Capacitor'],
    status:
      'CERRADO el 2026-10-11 (FRD-50). FiscoRD dejó de ser SaaS: sus datos viven ahora en el ERP como STP Facturas. La app (interno.fiscord.lat) muestra solo el aviso de fuera de servicio, el proyecto Supabase está PAUSADO (restaurable ~90 días), el cron de respaldo y el de la DGII/Telegram se quitaron, Sentry y PayPal cerrados. Respaldo final cifrado en Drive (backups diarios/fiscord/snapshots/2026-10-11, verificado: se descifra, 383 facturas / 9 empresas). Repo con tag respaldo-saas-2026-10-08. Quedan: borrar los proyectos viejos de Vercel, revocar llaves de Supabase/Resend y dejar vencer fiscord.lat.',
    recentWork: [
      '2026-10-11 FRD-50: apagado total de FiscoRD. Respaldo final verificado, aviso de fuera de servicio en la app (c41e2b3) y correo de contacto movido a Gmail al cerrar Google Workspace (1078a70). Las 365 facturas de STP se migraron antes al ERP (FRD-49).',
      'fix(lint): CI en rojo desde el 2026-09-13 por un warning real de `react-refresh/only-export-components` en AuthLayout.tsx (exportaba el hook `useAuthAside` junto al componente, y el script de lint corre con --max-warnings 0). El hook vive ahí a propósito (las páginas hijas lo usan para declarar el contenido del panel izquierdo) — se silenció con un eslint-disable puntual en vez de reestructurar. Verificado en vivo: run de GitHub Actions en verde tras el push.',
      'Segunda pasada de validación de la migración de mockups, esta vez sistemática contra las 72 pantallas del checklist original, creando empresas/cuentas throwaway (free, pyme, empresarial, contador con empresa vinculada) y subiendo planes por SQL directo para llegar a los estados bloqueados sin esperar pagos reales. Cubiertos en vivo: todo el flujo de auth, onboarding tour completo (5 pasos, cliente y contador), Dashboard vacío/con datos/con gráficas, Nueva Factura reorganizada, Escaneo Masivo, multi-empresa (switcher + alta), Historial (vacío/con datos/eliminar/editar), Importar (preview + completado), Ajustes/Plan/upgrade, y el panel de Contador completo (alta de cliente, aprobación desde la empresa, vista de empresa vinculada, abandonar empresa). Bug real encontrado y corregido: Escaneo Masivo (BulkScanPage.tsx) tenía el mismo problema de CSP con blob: que Nueva Factura -- la miniatura de la foto subida quedaba en blanco porque el navegador bloqueaba la decodificación vía blob: URL; corregido con el mismo patrón (FileReader a data: URL) y verificado con una foto real. Confirmado que la alerta previa de "los correos no llegan" era una falsa alarma -- Resend funcionaba bien, era una confusión de bandejas de Gmail del lado de Pedro.',
      'Migración de identidad de los mockups (canvas de diseño) a producción, pantalla por pantalla, verificada en vivo con la cuenta real de STP y 2 cuentas throwaway (contador y plan Free): panel de auth (decoración, centrado, logo, íconos) que se creía terminado en una sesión anterior en realidad seguía con la tarjeta vieja; Nueva Factura reorganizada (Tipo de gasto/Método de pago/Notas agrupados en su propia tarjeta "Clasificación para el 606"); botón de Reporte de Gastos (606) ahora resalta como elemento fuerte; barra de progreso "X de 30 facturas" agregada al widget de Plan Free; una decena de tokens de color hardcodeados (rojo/verde) migrados a los tokens reales danger/valid/destructive. 16 commits, todos verificados en vivo antes de darlos por buenos.',
      'FRD-15 ("hacer la app asincrónica" → carga inicial más rápida): lazy-loading de todas las rutas + carga bajo demanda de xlsx/jspdf al exportar. El chunk de entrada bajó de 858KB a 315KB; las librerías de exportar (1.8MB) ya no se precargan si el usuario nunca exporta.',
      'FRD-16: componentes compartidos LoadingState/ErrorState/EmptyState + hook useDebouncedValue, reemplazando las ~8 implementaciones ad hoc que cada pantalla reinventaba por su cuenta (y las 5 copias casi idénticas del mismo patrón de debounce). Puramente de presentación -- ningún cambio de lógica o comportamiento.',
      'FRD-14: fallos silenciosos corregidos en Dashboard/ContadorDashboard/Settings/TeamPage/HistoryPage (antes fallaban sin avisar al usuario), y botones sin protección de doble clic (cancelar suscripción, revocar invitación, reintentar escaneo, verificación de NCF duplicado sin debounce). Pendiente aparte (FRD-17, pospuesto a propósito): componente compartido de Loading/Error/Empty state -- hoy cada pantalla reinventa el suyo.',
      'Exportar todos los datos (facturas + fotos, con enlaces firmados válidos 30 días) por correo al dar de baja una empresa (FRD-5) -- nuevo tipo company_data_export en send-email, reusando la misma autorización admin/owner que ya existía. Probado de punta a punta en producción.',
      'Selector opcional "¿Cómo nos conociste?" en el registro de empresa (FRD-8) -- nueva columna companies.referral_source, register_company actualizada.',
      'Checkbox de aceptación de Términos y Condiciones / Privacidad en los 3 flujos de registro (empresa, contador, empleado, incluido el camino de Google) -- antes se creaba la cuenta sin pedirla nunca (FRD-3).',
      'Correos de ciclo de vida automatizados en email-cron: oferta de descuento a empresas free (10% primer mes, 3 correos/semana, con win-back a los 60 días de vuelta en free), recordatorio a empresas de pago que dejan de registrar facturas (3 correos), y exclusión de cuentas de prueba/internas de todas las campañas.',
      'Entorno de staging completo (FRD-11): proyecto Supabase propio (esquema, datos de referencia, storage y RLS replicados), 19 Edge Functions, PayPal en modo sandbox con sus propios planes, y una rama de Vercel dedicada con sus propias variables — antes todo cambio se probaba directo en producción.',
      'Bug real corregido: dos funciones (auth-email-hook, emailBrand.ts) tenían la URL de producción fija — cualquier ambiente que no fuera producción mandaría correos con links apuntando siempre a fiscord.lat.',
      'Hueco real encontrado y documentado: los 4 triggers de auth.users (los que crean el perfil al registrarse) nunca habían quedado en ningún archivo de migración, ni en producción — ahora sí, y de forma idempotente.',
      'fix(auth): pantalla de login muda cuando fallaba un login con Google desde el navegador embebido de otra app (ej. Gmail) — ahora explica qué pasó y qué hacer.',
      'docs(legal): corregida la razón social y el RNC en Términos/Privacidad.',
      'fix: la recuperación de contraseña daba acceso completo a la cuenta sin pedir una nueva.',
    ],
    links: [{ label: 'Web', url: 'https://fiscord.app' }],
  },
  'fiscord-sitio': {
    purpose: 'Sitio público de marketing de FiscoRD (fiscord.lat) — Astro SSG estático, separado de la app real.',
    stack: ['Astro', 'Vercel'],
    status:
      'Cerrado (2026-10-11, FRD-50): fiscord.lat sigue en línea solo con un banner de fuera de servicio y el correo de contacto fiscord.do@gmail.com. El dominio se deja vencer; sin Google Workspace.',
    recentWork: [
      '2026-10-11: banner de fuera de servicio (816ffc5) y correo de contacto cambiado a Gmail en todo el sitio (c69be1b).',
      'Reenvíos explícitos para /app y /superadmin sin subruta (FRD-7).',
      'OG images (1200×630) generadas para default y recursos; menú hamburguesa móvil; overflow horizontal corregido en guías; contraste AA; QA de accesibilidad/móvil.',
      'Cutover: fiscord.lat pasó de servir la app directo a servir este sitio Astro, con la app real detrás de interno.fiscord.lat.',
    ],
    links: [{ label: 'Sitio', url: 'https://fiscord.lat' }],
  },
  'mi-om': {
    purpose: 'App personal de Pedro para la Universidad O&M (iPhone): horario, materias, tareas, reuniones de Zoom y avance de carrera, leídos de su portal (lms2.oymas.edu.do).',
    stack: ['Expo SDK 57', 'React Native', 'NativeWind', 'WebView'],
    status: 'Fase 1 (diseño de AI Studio en nativo) y Fase 2 (sincronización real con el portal) terminadas y probadas en el iPhone vía Expo Go el 2026-10-06. Sigue: Fase 3 (notificaciones de clases, tareas y Zoom) y compilar con EAS para TestFlight (necesita cuenta Apple Developer).',
    recentWork: [
      'Sincronización real (2026-10-06, commit 23b8d32, rama expo de stpdevsolutions-commits/App-Universidad): lector que corre dentro del portal con la sesión de Pedro (perfil, asignaturas, horario, historial con créditos e índice, contenido y asignaciones por materia, Zoom), WebView invisible para sincronizar desde cualquier pantalla, Agregar desde el portal con formulario lleno.',
      'Login del portal dentro de la app: la verificación de Cloudflare (Turnstile) necesitaba permitir marcos about:blank/about:srcdoc en el WebView (commit ab71da3).',
      'App nativa con el diseño de Google AI Studio (2026-10-05/06, commits e6fe28e y f22aaf1): 7 pantallas, fechas calculadas contra RD, estado guardado en el teléfono, arreglo del cierre al arrancar en iPhone (aviso de NativeWind).',
    ],
  },
  'red-bendicion': {
    purpose: 'Plataforma para una red de iglesias en casa: directorio de hubs, mapa y panel administrativo interno.',
    stack: ['Next.js', 'Supabase'],
    status: 'Activo. Organigrama (con distribución compartida, PDF y Excel por rama) y Reportes por Red/Hub/Clúster en producción; migraciones 20261005120000 y 20261006120000 APLICADAS y verificadas el 2026-10-05. Pendiente: decidir si el registro pasa a ser solo por invitación. Integración CCB en espera de su API.',
    recentWork: [
      'PDF del organigrama y reportes por nivel (2026-10-05, commits 58711e2 + 3a336ea): "Descargar PDF" vectorial y Excel acotados a la rama elegida (Red/Hub/Clúster); gráfica "Miembros por red, hub y clúster" (pedido de Nataly). Auditoría con agentes: asistencia sin inactivos, listas >1000 paginadas (mapa, organigrama, usuarios, detalle de casa), restablecer contraseña con tope de rango y cliente implícito, CSV sin inyección de fórmulas, invitar/reportes solo liderazgo de red, i18n de asistencia/errores. Migración de seguridad 20261006120000 escrita, sin aplicar.',
      'Organigrama (2026-10-05, commit d4cb3a2): nueva sección a partir de la propuesta de Nataly (miembro de la red) — la red como árbol en vista radial u horizontal, zoom semántico, buscador, filtro por rama, ficha con Estructura de Liderazgo y personas por casa; el liderazgo puede acomodar los nodos y guardar la distribución para todos (tabla organigrama_disenos, migración 20261005120000 PENDIENTE de aplicar). "Descargar Excel" (.xlsx con hojas Resumen, Estructura y Miembros) solo para liderazgo de red.',
      'Alcance de roles por esfera (2026-09-29, migración 20260929120000 aplicada + commit 9b94adc): cada anciano edita solo su Red/Hub/Clúster asignado y lo de abajo (nodos, estudios de casa, asistencia, reportes y avance del Aula); todos ven mapa e iglesias; Miembros abierto a cualquier anciano. Roles solo por debajo del propio. Rol "Anciano líder" eliminado (→ Anciano de Clúster). Solo Pedro queda como Administrador; los otros 9 pasaron a Líder Apostólico.',
      'Refinamiento del mapa interno (2026-09-29, commits f493769 + 6bc9ad0): panel de capas solo para mostrar/ocultar niveles (sin la lista de redes duplicada); seleccionar una Red/Hub/Clúster abre solo su ficha y acota el mapa; barra con ocultar menú lateral, mapa limpio, pantalla completa real y modo edición (el mapa es de consulta por defecto). Estructura de Liderazgo en orden oficial Líder Apostólico → Anciano de Ciudad → Anciano de Clúster → Anciano de Iglesia → Anfitrión (se quitó el anciano supervisor de las casas); "Estudios de la Iglesia"; direcciones como lat/long. Miembros: filtro Red → Hub → Clúster → Iglesia y etapas de selección múltiple.',
      'Segunda tanda (2026-09-28): login y leyenda solo estructurales (sin números ni líderes/miembros, sin logo); leyenda y redes en tarjetas separadas con barra de totales abajo; control Mapa/Relieve/Satélite que conserva vista y filtros; recordar correo del login; arreglado el bug de "olvidé mi contraseña" (se quedaba pegado al volver atrás) y endurecida la persistencia de sesión; botón "Mapa" en el panel; "Integraciones" solo para admin (protegido en servidor + RLS).',
      'Investigación de CCB Cloud hecha solo observando el tráfico legítimo de su app (sin probar IDs ni endpoints): doc con el mapeo de datos y qué pedir a su equipo (credenciales de integración, esquema, IDs, coords). A reportar: un endpoint suyo respondió sin autenticación.',
      'Portada rediseñada (2026-09-27): columna izquierda con la leyenda "Red" como filtro de capas (Redes → Hubs → Clústeres → Iglesias en Casa → Líderes → Miembros) + lista de redes; mapa centrado en América con zoom libre y sin zooms automáticos; tarjeta de casa con "Cómo llegar" a Google Maps/Waze; botón al mapa desde el login y contraste del login en modo oscuro corregido.',
      'Nueva clasificación Curva 1 (en proceso de transicionar) / Curva 2 (Iglesia en Casa) en BD, editores, mapa y filtros; cifras públicas por nodo ("N miembros · M líderes") con nodes_publico_resumen().',
      'Alta de entidades con selector "Ingresar manualmente | Importar desde CCB Cloud" y capa de integración preparada (external_links, sync_runs, mapeo declarativo) sin inventar la API de CCB. Historial de migraciones del repo sincronizado 1:1 con la base (supabase migration fetch).',
      'Internacionalización ES/EN completa, incluidas secciones ocultas del sidebar (RBN-40, RBN-44) — cerrado, no queda pendiente de idioma.',
      'Repo transferido de la cuenta personal de Pedro (PedroAngSs) a la cuenta de STP (stpdevsolutions-commits) — consolidación de todos los repos bajo una sola cuenta. Remote local actualizado y verificado con fetch.',
      'Modo claro/oscuro con next-themes (la paleta oscura ya existía en el CSS, solo faltaba conectar el provider y el botón del header).',
      'Selector de redes en la leyenda del mapa (portada pública y panel interno): al elegir una red, el mapa vuela a ella y muestra sus conteos en una tarjeta.',
      '"Una red de redes" agregado arriba de la jerarquía en el login.',
      'Corregido el watermark de los mapas (cambio de proveedor de tiles a OSM/OpenTopoMap).',
      'Rediseño del login y filtro de tipo de mapa en el panel interno.',
    ],
  },
  vigacalc: {
    purpose: 'Calculadora de vigas standalone — la herramienta original antes de unificarse en EstrucCalc RD Pro. Ya no existe.',
    stack: ['HTML/JS'],
    status:
      'Eliminado por completo el 2026-09-18: repo en GitHub borrado y carpeta local en el PC (C:\\Proyectos\\vigacalc) borrada, tras confirmar con Pedro que toda su funcionalidad ya vivía en EstrucCalc RD Pro desde el 29 de agosto. Ficha conservada solo como referencia histórica.',
    recentWork: [
      'Repo de GitHub y carpeta local borrados por completo (2026-09-18), como parte de una limpieza de redundancia entre los 13 repos de stpdevsolutions-commits.',
      'Repo transferido de PedroAngSs a stpdevsolutions-commits junto con el resto de los repos personales, antes de borrarse.',
    ],
  },
  'hermes-agent': {
    purpose:
      'Asistente personal de Pedro por Telegram (@stp_asistente_bot) — open source de Nous Research, no desarrollado por STP, solo desplegado y conectado a los sistemas propios.',
    stack: [
      'Python',
      'Docker',
      'OpenRouter (nvidia/nemotron-3-super-120b-a12b:free — perfil default)',
      'Anthropic (OAuth de la suscripción Claude Pro/Max, Claude Sonnet 5 — perfiles desarrollo/soporte)',
      'MCP',
    ],
    status:
      'En producción. Conectado a Tickets, Vigía (solo lectura), Cotizaciones/Clientes del ERP (solo lectura) y Mi Día app vía un servidor MCP propio (stp-mcp-server, en el repo de stp-erp) — 17 herramientas en total. Probado de punta a punta en cada una.',
    recentWork: [
      '2026-10-11: triage diario de STP Tickets arreglado (llevaba semanas sin llegar): entregaba a un destino roto (bot-chat), y el job quedó saltado por la protección de gasto al cambiar el modelo por defecto. Ahora fijado a un modelo gratis de OpenRouter y entrega directa a Telegram; probado. Hermes va por API de pago por uso, no por la cuenta Pro.',
      'SOUL.md de "desarrollo" actualizado: cuando diagnostica un bug real y concreto en un proyecto registrado en el pipeline, ahora lo OFRECE explícitamente ("¿quieres que lo implemente con el pipeline de ingeniería?") en vez de solo decir "esto necesita una sesión de Claude Code" — sigue sin implementar nada sin que Pedro apruebe primero, y sigue sin poder hacer commit/push/publicar por su cuenta.',
      'Skill "engineering-pipeline" extendido a los perfiles "desarrollo" y "soporte" (antes solo lo tenía "default") — el hook de arranque ahora siembra el skill en todos los perfiles existentes, incluidos los que se creen en el futuro.',
      'Pipeline de ingeniería integrado (skill "engineering-pipeline", paquete de comunidad auditado línea por línea antes de instalar — sin credenciales embebidas, sin shell=True, guardas reales vía flags del CLI): capa Docker propia (gh + claude + codex CLI) sobre la imagen base de Hermes, sin tocar el Dockerfile upstream. 12 repos de STP registrados en ~/.hermes/engineering-pipeline/projects.json con slugs/alias. Deja que un perfil delegue una tarea técnica real a Claude Code (worktree aislado, sin permiso de commit/push/merge/gh/docker) y a Codex como auditor de solo lectura, con aprobación humana antes de publicar. Probado de punta a punta (bootstrap real de fiscord).',
      'Corregido: los perfiles "desarrollo"/"soporte" (HRM-7) SÍ tienen gateway propio -- la entrada anterior de esta ficha decía lo contrario (desactualizada). Causa real de que llevaran días sin poder arrancar: los tres perfiles (default incluido) compartían el mismo TELEGRAM_BOT_TOKEN. Se creó un bot dedicado para cada uno (@stp_desarrollo_bot, @stp_soporte_bot) y se activó su gateway -- sobrevive un reinicio del contenedor solo (mecanismo nativo de Hermes vía gateway_state.json, sin hooks propios).',
      'Cambiados "desarrollo"/"soporte" de Nemotron gratis a Claude Sonnet 5 por OAuth de la suscripción Pro/Max de Pedro (hermes auth add anthropic --type oauth, NO api key) -- resolvió cuelgues reales y reproducibles del modelo gratis (clasificador de auto-aprobación colgado dos veces, y un turno abandonado en silencio tras una llamada a herramienta). De paso se puso approvals.mode=manual en ambos perfiles, quitando el paso de auto-clasificación que causaba uno de los dos tipos de cuelgue.',
      'Gotcha de despliegue real: reconstruir la imagen sin fijar HERMES_UID=1000/HERMES_GID=1000 explícitamente remapea ~/.hermes a un UID distinto del de los archivos existentes y rompe Telegram con errores de permiso -- corregido de raíz con un ~/hermes-agent/.env fijo para que no se repita en el próximo rebuild.',
      'Dos perfiles nuevos de Hermes (HRM-7): "desarrollo" (apoyo técnico/diagnóstico en los proyectos activos, no escribe código) y "soporte" (dueño del triage diario de STP Tickets en todos los proyectos). Clonados del perfil default, cada uno con su propio SOUL.md. Se evaluaron perfiles de supervisión/auditoría/seguridad pero se pospusieron por alcance ambiguo.',
      'Encontrado: el modelo gratis de OpenRouter (nvidia/nemotron-3-super-120b-a12b:free) tiene tope de 50 peticiones/día sin comprar créditos — con 3 perfiles activos ese tope se agota más fácil. Se decidió NO comprar créditos todavía; monitorear con `hermes cron incidents` (tipo rate_limit) antes de decidir.',
      'Dashboard web propio activado (ya venía incluido en hermes-agent, solo hacía falta prenderlo): contenedor dedicado con auth básica, expuesto en hermes.stpsoluciones.com vía Caddy restringido a VPN/LAN.',
      'Bug real encontrado y arreglado: stp-mcp-server crasheaba completo (las 13 herramientas, no solo correo) por un socket IMAP con error no manejado -- root cause del resumen diario incompleto del 2026-09-04.',
      'Acceso de correo (IMAP, solo lectura) a las 6 cuentas de Pedro y lectura de tareas de Mi Dia agregados al stp-mcp-server. Cron job "Resumen diario" (7am): revisa correos + tareas + tickets abiertos y manda el resumen a Telegram.',
      'Sumadas Vigía (solo lectura: servicios, proyectos, alertas, métricas), Cotizaciones/Clientes del ERP (solo lectura, con una cuenta de sistema propia de rol admin) y Mi Día app (agregar tareas/notas, vía endpoints quick-add nuevos para no chocar con la sincronización del celular).',
      'Vinculado a Telegram y a OpenRouter (modelo gratis) — 2026-09-01.',
      'Servidor MCP propio construido y conectado, empezando por Tickets: list_projects, list_tickets, create_ticket, update_ticket_status.',
      'A propósito, nunca se expone escritura sobre Cotizaciones/Clientes por chat — solo consulta.',
    ],
  },
  'stp-tickets-app': {
    purpose:
      'Sistema propio de tickets (bugs/cambios/mejoras/nuevos desarrollos) para todos los proyectos de STP — construido a medida en vez de adoptar Jira/Vikunja/Plane, evaluados y descartados por pesados para este servidor.',
    stack: ['NestJS', 'TypeORM', 'PostgreSQL', 'Next.js', 'Docker', 'Caddy'],
    status:
      'En producción, tickets.stpsoluciones.com, sin login (gateado por VPN). Dos secciones: el tablero de tickets y el Roadmap (etapas + línea de tiempo). Conectado a Hermes Agent vía MCP — se puede crear/consultar tickets por chat de Telegram, incluso por nota de voz.',
    recentWork: [
      'Sección Roadmap nueva: entidad Sprint (etapas con fecha de inicio/fin y objetivo), timeline tipo Gantt en CSS puro, changelog de lo entregado por semana y avance por proyecto — para ver qué se hizo y cuánto falta. Sembradas 5 etapas reales.',
      'Los filtros del tablero (proyecto, tipo, estado, búsqueda, orden) ahora persisten en localStorage y se recuperan al reabrir, aunque se cierre el navegador.',
      'Código de ticket por proyecto (FRD-1, ERP-2...) en vez de solo un número global.',
      'Bug real corregido: el orden por prioridad era alfabético ("urgent" > "medium" > "low" > "high"), no por severidad — ahora es el orden real.',
      'Comentarios por ticket, campo "Asignado a", tipo nuevo "Nuevo desarrollo", buscador de texto, selector de orden, y página de detalle propia por ticket.',
      'Aviso a Telegram (mismo bot de Hermes) cuando se crea o se resuelve un ticket.',
      'Pendiente identificado, no construido: adjuntar capturas de pantalla (necesita almacenamiento de archivos que todavía no está montado para este servicio).',
    ],
    links: [{ label: 'Tickets', url: 'https://tickets.stpsoluciones.com' }],
  },
  'fantasy-nba-assistant': {
    purpose:
      'Asistente personal (no de STP, de Pedro) para su liga de fantasy de NBA en ESPN — ayuda en el draft, analiza enfrentamientos semanales y recomienda cambios de jugadores, conectado a Hermes Agent por Telegram.',
    stack: ['Node.js', 'MCP', 'Docker'],
    status:
      'En producción, probado por Pedro vía Telegram. Habla directo con la API no oficial de ESPN Fantasy (con las cookies de sesión de Pedro) — de solo lectura, nunca hace drafts ni cambios de roster por sí solo.',
    recentWork: [
      'Dashboard web propio en fantasy.stpsoluciones.com (gateado por VPN) — posiciones, mi equipo y ranking de jugadores, con toggle de disponibles/todos.',
      'Herramientas iniciales: info de liga, posiciones, roster propio y ranking de jugadores disponibles por ADP (sirve para preparar el draft y para buscar agentes libres).',
      'Confirmado en vivo contra la liga real de Pedro: el draft de la temporada 2026-27 todavía no se ha hecho.',
      'Pendiente a propósito, no construido: análisis de enfrentamientos semanales por categoría — los IDs de estadísticas de ESPN no están documentados (la liga usa 15 categorías, no las 9 típicas) y confirmarlos mal daría recomendaciones equivocadas; se valida contra un resultado real cuando arranque la temporada.',
    ],
    links: [{ label: 'Dashboard', url: 'https://fantasy.stpsoluciones.com' }],
  },
  vigia: {
    purpose:
      'Panel propio de monitoreo de todo lo que corre en el servidor de STP — estado de contenedores, healthchecks de servicios, estatus de git de cada proyecto y alertas por Telegram/email. Reemplazó a Uptime Kuma.',
    stack: ['NestJS', 'TypeORM', 'PostgreSQL', 'Next.js', 'Docker', 'Caddy'],
    status:
      'En producción, uso diario para revisar el estado real de todo el servidor. Además de sus propios healthchecks, expone lectura (proyectos, servicios, alertas, métricas) a Hermes Agent vía MCP.',
    recentWork: [
      'Quitado el healthcheck huérfano de Uptime Kuma en services.service.ts — el contenedor se dio de baja el 2026-09-05 pero el monitor seguía registrado y marcaba "down" permanente sin representar una falla real.',
    ],
    links: [{ label: 'Vigía', url: 'https://monitor.stpsoluciones.com' }],
  },
  'stpsoluciones-landing': {
    purpose: 'Landing de marketing de STP Soluciones (la empresa) — HTML estático + pequeña API serverless.',
    stack: ['HTML', 'Vercel'],
    status:
      'En producción, desplegado en Vercel desde el repo directamente (no necesita checkout local en el servidor — se borró una copia huérfana que había en ~/stpsoluciones-landing el 2026-09-18 porque no la usaba nada).',
    recentWork: ['fix(seo): las tarjetas de empleado quedan fuera de los buscadores.'],
    links: [{ label: 'Web', url: 'https://stpsoluciones.com' }],
  },
};
