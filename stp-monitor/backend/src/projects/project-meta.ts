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
 * Fichas de proyecto RETIRADAS el 2026-10-13: la documentación (propósito, estado, historial) vive
 * en AppFlowy (https://notas.stpsoluciones.com, workspaces "STP" y "Personal"). Cada entrada solo apunta a su
 * página. Vigía conserva el monitoreo en vivo. El contenido original está respaldado en ~/doc-build.
 */
export const PROJECT_META: Record<string, ProjectMeta> = {
  "stp-erp": {
    purpose: "Ficha retirada de Vigía el 2026-10-13: la documentación de este proyecto vive ahora en AppFlowy.",
    stack: [],
    status: "Esta tarjeta muestra solo el estado en vivo (git, servicios, alertas). La descripción, el estado y el historial del proyecto están en su página de AppFlowy.",
    recentWork: ["Ver el historial completo en AppFlowy (enlace de abajo)."],
    links: [{ label: "Documentación en AppFlowy", url: "https://notas.stpsoluciones.com/app/da265893-d216-44bc-9d33-84cd4864ea05/a5ac2b0c-8bce-4748-b94e-e8a429b29fff" }, { label: "ERP", url: "https://erp.stpsoluciones.com" }],
  },
  "stp-mobile": {
    purpose: "Ficha retirada de Vigía el 2026-10-13: la documentación de este proyecto vive ahora en AppFlowy.",
    stack: [],
    status: "Esta tarjeta muestra solo el estado en vivo (git, servicios, alertas). La descripción, el estado y el historial del proyecto están en su página de AppFlowy.",
    recentWork: ["Ver el historial completo en AppFlowy (enlace de abajo)."],
    links: [{ label: "Documentación en AppFlowy", url: "https://notas.stpsoluciones.com/app/da265893-d216-44bc-9d33-84cd4864ea05/61179163-2066-4a48-879b-d97d7db18a83" }],
  },
  "ecf-saas": {
    purpose: "Ficha retirada de Vigía el 2026-10-13: la documentación de este proyecto vive ahora en AppFlowy.",
    stack: [],
    status: "Esta tarjeta muestra solo el estado en vivo (git, servicios, alertas). La descripción, el estado y el historial del proyecto están en su página de AppFlowy.",
    recentWork: ["Ver el historial completo en AppFlowy (enlace de abajo)."],
    links: [{ label: "Documentación en AppFlowy", url: "https://notas.stpsoluciones.com/app/da265893-d216-44bc-9d33-84cd4864ea05/5d76268e-3c32-4ba1-834c-e34a119625f9" }],
  },
  "mi-dia": {
    purpose: "Ficha retirada de Vigía el 2026-10-13: la documentación de este proyecto vive ahora en AppFlowy.",
    stack: [],
    status: "Esta tarjeta muestra solo el estado en vivo (git, servicios, alertas). La descripción, el estado y el historial del proyecto están en su página de AppFlowy.",
    recentWork: ["Ver el historial completo en AppFlowy (enlace de abajo)."],
    links: [{ label: "Documentación en AppFlowy", url: "https://notas.stpsoluciones.com/app/91feb604-939c-47d0-b224-fc9fb908b19d/974ea823-6502-4138-9413-d0fc40c166e7" }, { label: "Mi Día", url: "https://dia.stpsoluciones.com" }],
  },
  "estructuralrd": {
    purpose: "Ficha retirada de Vigía el 2026-10-13: la documentación de este proyecto vive ahora en AppFlowy.",
    stack: [],
    status: "Esta tarjeta muestra solo el estado en vivo (git, servicios, alertas). La descripción, el estado y el historial del proyecto están en su página de AppFlowy.",
    recentWork: ["Ver el historial completo en AppFlowy (enlace de abajo)."],
    links: [{ label: "Documentación en AppFlowy", url: "https://notas.stpsoluciones.com/app/da265893-d216-44bc-9d33-84cd4864ea05/88313c38-c243-4a21-96c5-89847c752be9" }],
  },
  "fiscord": {
    purpose: "Ficha retirada de Vigía el 2026-10-13: la documentación de este proyecto vive ahora en AppFlowy.",
    stack: [],
    status: "Esta tarjeta muestra solo el estado en vivo (git, servicios, alertas). La descripción, el estado y el historial del proyecto están en su página de AppFlowy.",
    recentWork: ["Ver el historial completo en AppFlowy (enlace de abajo)."],
    links: [{ label: "Documentación en AppFlowy", url: "https://notas.stpsoluciones.com/app/da265893-d216-44bc-9d33-84cd4864ea05/f1df2114-40ab-4aad-8674-c5cfaecfbe9e" }, { label: "Web", url: "https://fiscord.app" }],
  },
  "fiscord-sitio": {
    purpose: "Ficha retirada de Vigía el 2026-10-13: la documentación de este proyecto vive ahora en AppFlowy.",
    stack: [],
    status: "Esta tarjeta muestra solo el estado en vivo (git, servicios, alertas). La descripción, el estado y el historial del proyecto están en su página de AppFlowy.",
    recentWork: ["Ver el historial completo en AppFlowy (enlace de abajo)."],
    links: [{ label: "Documentación en AppFlowy", url: "https://notas.stpsoluciones.com/app/da265893-d216-44bc-9d33-84cd4864ea05/f1df2114-40ab-4aad-8674-c5cfaecfbe9e" }, { label: "Sitio", url: "https://fiscord.lat" }],
  },
  "mi-om": {
    purpose: "Ficha retirada de Vigía el 2026-10-13: la documentación de este proyecto vive ahora en AppFlowy.",
    stack: [],
    status: "Esta tarjeta muestra solo el estado en vivo (git, servicios, alertas). La descripción, el estado y el historial del proyecto están en su página de AppFlowy.",
    recentWork: ["Ver el historial completo en AppFlowy (enlace de abajo)."],
    links: [{ label: "Documentación en AppFlowy", url: "https://notas.stpsoluciones.com/app/91feb604-939c-47d0-b224-fc9fb908b19d/faf3c86b-804f-492b-9769-e40571f2cf00" }],
  },
  "red-bendicion": {
    purpose: "Ficha retirada de Vigía el 2026-10-13: la documentación de este proyecto vive ahora en AppFlowy.",
    stack: [],
    status: "Esta tarjeta muestra solo el estado en vivo (git, servicios, alertas). La descripción, el estado y el historial del proyecto están en su página de AppFlowy.",
    recentWork: ["Ver el historial completo en AppFlowy (enlace de abajo)."],
    links: [{ label: "Documentación en AppFlowy", url: "https://notas.stpsoluciones.com/app/91feb604-939c-47d0-b224-fc9fb908b19d/e0e744b0-b191-4cfd-a7d3-504d778bcd33" }],
  },
  "vigacalc": {
    purpose: "Ficha retirada de Vigía el 2026-10-13: la documentación de este proyecto vive ahora en AppFlowy.",
    stack: [],
    status: "Esta tarjeta muestra solo el estado en vivo (git, servicios, alertas). La descripción, el estado y el historial del proyecto están en su página de AppFlowy.",
    recentWork: ["Ver el historial completo en AppFlowy (enlace de abajo)."],
    links: [{ label: "Documentación en AppFlowy", url: "https://notas.stpsoluciones.com/app/da265893-d216-44bc-9d33-84cd4864ea05/f1df2114-40ab-4aad-8674-c5cfaecfbe9e" }],
  },
  "hermes-agent": {
    purpose: "Ficha retirada de Vigía el 2026-10-13: la documentación de este proyecto vive ahora en AppFlowy.",
    stack: [],
    status: "Esta tarjeta muestra solo el estado en vivo (git, servicios, alertas). La descripción, el estado y el historial del proyecto están en su página de AppFlowy.",
    recentWork: ["Ver el historial completo en AppFlowy (enlace de abajo)."],
    links: [{ label: "Documentación en AppFlowy", url: "https://notas.stpsoluciones.com/app/da265893-d216-44bc-9d33-84cd4864ea05/e95e89d0-524b-4196-9d7f-c1020530afee" }],
  },
  "stp-tickets-app": {
    purpose: "Ficha retirada de Vigía el 2026-10-13: la documentación de este proyecto vive ahora en AppFlowy.",
    stack: [],
    status: "Esta tarjeta muestra solo el estado en vivo (git, servicios, alertas). La descripción, el estado y el historial del proyecto están en su página de AppFlowy.",
    recentWork: ["Ver el historial completo en AppFlowy (enlace de abajo)."],
    links: [{ label: "Documentación en AppFlowy", url: "https://notas.stpsoluciones.com/app/da265893-d216-44bc-9d33-84cd4864ea05/23969e41-bbbb-45a3-aed1-b27ee80ddfca" }, { label: "Tickets", url: "https://tickets.stpsoluciones.com" }],
  },
  "fantasy-nba-assistant": {
    purpose: "Ficha retirada de Vigía el 2026-10-13: la documentación de este proyecto vive ahora en AppFlowy.",
    stack: [],
    status: "Esta tarjeta muestra solo el estado en vivo (git, servicios, alertas). La descripción, el estado y el historial del proyecto están en su página de AppFlowy.",
    recentWork: ["Ver el historial completo en AppFlowy (enlace de abajo)."],
    links: [{ label: "Documentación en AppFlowy", url: "https://notas.stpsoluciones.com/app/91feb604-939c-47d0-b224-fc9fb908b19d/f48d293d-f5a1-45ad-bc64-57671a569a32" }, { label: "Dashboard", url: "https://fantasy.stpsoluciones.com" }],
  },
  "vigia": {
    purpose: "Ficha retirada de Vigía el 2026-10-13: la documentación de este proyecto vive ahora en AppFlowy.",
    stack: [],
    status: "Esta tarjeta muestra solo el estado en vivo (git, servicios, alertas). La descripción, el estado y el historial del proyecto están en su página de AppFlowy.",
    recentWork: ["Ver el historial completo en AppFlowy (enlace de abajo)."],
    links: [{ label: "Documentación en AppFlowy", url: "https://notas.stpsoluciones.com/app/da265893-d216-44bc-9d33-84cd4864ea05/5c90fce2-2af0-4747-af7e-8fb67d889294" }, { label: "Vigía", url: "https://monitor.stpsoluciones.com" }],
  },
  "stpsoluciones-landing": {
    purpose: "Ficha retirada de Vigía el 2026-10-13: la documentación de este proyecto vive ahora en AppFlowy.",
    stack: [],
    status: "Esta tarjeta muestra solo el estado en vivo (git, servicios, alertas). La descripción, el estado y el historial del proyecto están en su página de AppFlowy.",
    recentWork: ["Ver el historial completo en AppFlowy (enlace de abajo)."],
    links: [{ label: "Documentación en AppFlowy", url: "https://notas.stpsoluciones.com/app/da265893-d216-44bc-9d33-84cd4864ea05/53d41958-d14e-4a79-8c27-0ca97eceaaea" }, { label: "Web", url: "https://stpsoluciones.com" }],
  },
};
