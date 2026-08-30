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
      'WhatsApp de asignación de tareas: el número siempre sale del Colaborador (persona real en obra), nunca del Usuario (cuenta de acceso) — evita duplicar avisos o notificar al teléfono equivocado.',
      'WhatsApp de asignación de tareas vía puente propio (Baileys) — sesión vinculada y probada de punta a punta (mensaje de prueba confirmado recibido).',
      'Login con Google y reestructuración de fichas (Domótica separada de Levantamiento) en la app móvil.',
      'Vigía ampliado con el módulo de Proyectos y más servicios monitoreados.',
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
    recentWork: ['feat(ui): paleta verde salvia en vez de azul/turquesa.'],
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
    status: 'Web al día en Vercel. APK Android firmado con keystore real, publicado en apk.stpsoluciones.com.',
    recentWork: [
      'docs(legal): corregida la razón social y el RNC en Términos/Privacidad.',
      'fix: la recuperación de contraseña daba acceso completo a la cuenta sin pedir una nueva.',
      'feat(superadmin): envío de códigos de descuento desde el detalle de la empresa.',
    ],
    links: [{ label: 'Web', url: 'https://fiscord.app' }],
  },
  'red-bendicion': {
    purpose: 'Plataforma para una red de iglesias en casa: directorio de hubs, mapa y panel administrativo interno.',
    stack: ['Next.js', 'Supabase'],
    status: 'Al día, sin pendientes abiertos.',
    recentWork: [
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
};
