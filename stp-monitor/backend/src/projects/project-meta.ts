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
      'WhatsApp de asignación de tareas migrado a la API oficial de Meta (Cloud API) — número real conectado, token permanente, webhook de estado, plantilla "tarea_asignada" aprobada y confirmada de punta a punta. Se abandonó del todo el puente no oficial (Baileys) por un problema real de la librería, no de configuración.',
      'STP Tickets (sistema propio de bugs/cambios/mejoras): número de reporte correlativo por ticket, y ahora conectado a Hermes Agent vía MCP — se puede crear/consultar tickets por chat de Telegram.',
      'Cotizaciones: el ITBIS de gastos indirectos ahora es removible y con base elegible (gravables o total de la factura) — antes quedaba fijo en "Dirección Técnica" sin poder quitarse.',
      'Login con Google y reestructuración de fichas (Domótica separada de Levantamiento) en la app móvil.',
    ],
    links: [{ label: 'ERP', url: 'https://erp.stpsoluciones.com' }],
  },
  'stp-mobile': {
    purpose:
      'App móvil para los técnicos de campo de STP: llenar fichas técnicas (eléctrico, civil, electromecánico, levantamiento, domótica, evaluación de daños) desde el sitio, con fotos, firma y GPS.',
    stack: ['Expo', 'React Native', 'TypeScript', 'expo-router'],
    status:
      'Al día, distribuida por apk.stpsoluciones.com (no Play Store). Login con Google funcionando además del de correo/contraseña.',
    recentWork: [
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
    status: 'Web al día en Vercel. APK Android firmado con keystore real, publicado en apk.stpsoluciones.com. Ahora con entorno de staging real (Supabase + rama de Vercel propios), separado de producción por primera vez.',
    recentWork: [
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
  'red-bendicion': {
    purpose: 'Plataforma para una red de iglesias en casa: directorio de hubs, mapa y panel administrativo interno.',
    stack: ['Next.js', 'Supabase'],
    status: 'Activo. Único pendiente en STP Tickets: internacionalización ES/EN (RBN-3, sin empezar).',
    recentWork: [
      'Modo claro/oscuro con next-themes (la paleta oscura ya existía en el CSS, solo faltaba conectar el provider y el botón del header).',
      'Selector de redes en la leyenda del mapa (portada pública y panel interno): al elegir una red, el mapa vuela a ella y muestra sus conteos en una tarjeta.',
      '"Una red de redes" agregado arriba de la jerarquía en el login.',
      'Corregido el watermark de los mapas (cambio de proveedor de tiles a OSM/OpenTopoMap).',
      'Rediseño del login y filtro de tipo de mapa en el panel interno.',
    ],
  },
  vigacalc: {
    purpose: 'Calculadora de vigas standalone — la herramienta original antes de unificarse en EstrucCalc RD Pro.',
    stack: ['HTML/JS'],
    status: 'Retirado. Ya no es donde se trabaja; toda su funcionalidad vive ahora en EstrucCalc RD Pro.',
    recentWork: ['(sin cambios recientes — repo de referencia, no activo)'],
  },
  'hermes-agent': {
    purpose:
      'Asistente personal de Pedro por Telegram (@stp_asistente_bot) — open source de Nous Research, no desarrollado por STP, solo desplegado y conectado a los sistemas propios.',
    stack: ['Python', 'Docker', 'OpenRouter (nvidia/nemotron-3-super-120b-a12b:free)', 'MCP'],
    status:
      'En producción. Conectado a Tickets, Vigía (solo lectura), Cotizaciones/Clientes del ERP (solo lectura) y Mi Día app vía un servidor MCP propio (stp-mcp-server, en el repo de stp-erp) — 17 herramientas en total. Probado de punta a punta en cada una.',
    recentWork: [
      'Dos perfiles nuevos de Hermes (HRM-7): "desarrollo" (apoyo técnico/diagnóstico en los proyectos activos, no escribe código) y "soporte" (dueño del triage diario de STP Tickets en todos los proyectos, 8am RD, avisa por el mismo Telegram vía bot-chat:default). Clonados del perfil default, cada uno con su propio SOUL.md. Sin gateway propio a propósito (evita chocar el token de Telegram) — su cron corre por un tick cada 15 min en el crontab del host. Se evaluaron perfiles de supervisión/auditoría/seguridad pero se pospusieron por alcance ambiguo.',
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
      'En producción, tickets.stpsoluciones.com, sin login (gateado por VPN). Conectado a Hermes Agent vía MCP — se puede crear/consultar tickets por chat de Telegram, incluso por nota de voz.',
    recentWork: [
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
};
