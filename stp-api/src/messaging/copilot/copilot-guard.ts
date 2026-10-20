import {
  COPILOT_CATEGORIES,
  COPILOT_SERVICES,
  DISCLOSURE,
  MAX_REPLY_CHARS,
  MIN_CONFIDENCE,
  OFFICE_HOURS_NOTE,
  type CopilotCategory,
  type CopilotService,
  type RawAnalysis,
} from './copilot-rules';

/**
 * Reglas duras del copiloto (docs/whatsapp-copiloto.md, sección 2). La IA propone; esta función corrige o descarta.
 * Es una función pura: no toca la red ni la base de datos, y es la que más pruebas tiene.
 */

export interface GuardContext {
  /** El número está vinculado a un cliente del ERP. */
  clientExists: boolean;
  /** STP aún no le ha enviado el aviso de asistente virtual a esta persona. */
  needsDisclosure: boolean;
  /** Tipo del último mensaje entrante (text, audio, image, ...). */
  lastInboundType: string;
  /** Texto de los mensajes entrantes desde la última respuesta del equipo (lo que el cliente acaba de decir). */
  recentInboundText: string;
  /** Dentro de la ventana de 24 h (texto libre permitido). */
  withinWindow: boolean;
  /** Dentro del horario de atención. */
  workingHours: boolean;
}

export type SuggestionKind = 'responder' | 'derivar' | 'ninguna';

export interface GuardedSuggestion {
  category: CopilotCategory;
  summary: string;
  service: CopilotService | null;
  lead: { name: string | null; location: string | null; details: string | null };
  missing: string[];
  /** Una persona debe atender esto (con o sin respuesta propuesta). */
  escalate: boolean;
  escalationReasons: string[];
  /** Respuesta ya filtrada y con el aviso de asistente virtual; null si no se propone ninguna. */
  reply: string | null;
  confidence: number;
  kind: SuggestionKind;
  /** Qué reglas intervinieron (para auditar y para las pruebas). */
  flags: string[];
}

/** Minúsculas y sin acentos, para comparar con expresiones sencillas. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

const URGENCY =
  /\b(urgente|urgencia|emergencia|fuga|cortocircuito|corto circuito|chispa[s]?|chispeand|humo|olor a quemado|se quemo|quemandose|incendio|fuego|inundacion|inundando|electrocut\w*|descarga electrica|me dio corriente|peligro|riesgo|sin luz|sin agua|apagon)\b/;
const COMPLAINT =
  /\b(queja|reclamo|molest[oa]|inconforme|mal servicio|pesimo|terrible|estafa|estafador|abogado|demanda|insatisfech[oa]|enojad[oa]|decepcion\w*|nadie me (ha )?(respondido|contestado|llamado)|no me (han )?(respondido|contestado|llamado)|me dejaron plantado|incumpl\w+)\b/;
const EXISTING_CLIENT =
  /\b(ya soy cliente|soy cliente|ya les compre|mi proyecto|mi obra|mi cotizacion|mi factura|mi pago|mi garantia|ya me instalaron|ya instalaron|el tecnico que vino|la visita que hicieron)\b/;
const WANTS_PERSON =
  /\b(hablar con (una |un )?(persona|alguien|asesor|ingeniero|humano|encargado|gerente|representante)|quiero (un |una )?(asesor|humano|representante|persona)|pasame con|comunicarme con|que me llame|llamenme|prefiero llamar)\b/;
const PRICE_ASK =
  /\b(cuanto (cuesta|cuestan|cobran|sale|salen|vale|valen|me cobran|seria|es)|que precio|precio|precios|costo|costos|presupuesto|tarifa|cuanto es)\b/;
const PROMPT_INJECTION =
  /\b(ignora (tus|las|todas)|ignore (your|all|previous)|olvida (tus|las) (reglas|instrucciones)|system prompt|prompt del sistema|actua como|eres ahora|jailbreak|revela (tus|el) (reglas|instrucciones|prompt))\b/;

/** Montos, rangos o descuentos: R1. Se evalúa sobre el texto sin acentos. */
const PRICE_IN_REPLY: RegExp[] = [
  /rd\s?\$|us\s?\$|\$\s?\d|\d\s?\$/,
  /\d[\d.,]*\s?(pesos|dolares|usd|dop|rd)\b/,
  /\b(pesos|dolares)\b/,
  /\bdesde\s+(rd|us|\$|\d)/,
  /\b\d+\s?(mil|k)\b/,
  /\b(cuesta|cuestan|cobramos|cobra|sale|salen|vale|valen)\s+(entre|alrededor|aproximadamente|unos|unas|\d)/,
  /\b(descuento|oferta|promocion|rebaja|barato|economico|itbis)\b/,
  /\b(precio|costo|tarifa|presupuesto)s?\s+(de|es|seria|ronda|aproximado|estimado|base|inicial)\s+(rd|us|\$|\d|unos|entre|alrededor)/,
];
/** Fechas, horas y plazos prometidos: R2. */
const COMMITMENT_IN_REPLY: RegExp[] = [
  /\b(manana|hoy mismo|hoy a las|esta (tarde|noche|semana|manana)|pasado manana|proxima semana|en breve hoy)\b/,
  /\ben\s+(\d+|un|una|dos|tres|cuatro|cinco|unos|unas)\s+(dias?|horas?|semanas?|minutos?)\b/,
  /\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/,
  /\b\d{1,2}(:\d{2})?\s?(am|pm|a\. ?m\.?|p\. ?m\.?)/,
  /\b(le prometemos|prometemos|garantizamos|le garantizo|aseguramos|sin falta|con seguridad)\b/,
];
/** Datos sensibles y enlaces: R5/R6. */
const SENSITIVE_IN_REPLY = /\b(cedula|tarjeta|contrasena|clave de acceso|cuenta bancaria|numero de cuenta|cvv|pin)\b/;
const LINK_IN_REPLY = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|do)\b)/;
const EMOJI = /[\p{Extended_Pictographic}️‍]/gu;

const NON_TEXT_TYPES = new Set(['audio', 'image', 'video', 'document', 'location', 'sticker']);

const REASON_LABEL: Record<string, string> = {
  cliente_existente: 'El número es de un cliente del ERP o dice serlo: lo atiende una persona.',
  urgencia: 'Menciona una urgencia o un riesgo: atender de inmediato.',
  queja: 'Expresa una queja o molestia: lo atiende una persona.',
  precio: 'Pregunta por precio: el costo lo da una persona después de la visita técnica.',
  hablar_con_persona: 'Pidió hablar con una persona.',
  mensaje_no_texto: 'Mensaje sin texto (audio, foto, ubicación o documento): revisar a mano.',
  fuera_de_alcance: 'Tema fuera de los servicios de STP.',
  baja_confianza: 'La IA no está segura de cómo responder.',
  instruccion_sospechosa: 'El mensaje intenta dar instrucciones al asistente.',
  fuera_de_ventana: 'Pasaron más de 24 h: solo se puede enviar una plantilla.',
  sin_respuesta_segura: 'La respuesta propuesta rompía una regla y se descartó.',
  ia: 'La IA recomendó que lo atienda una persona.',
  spam: 'Parece spam.',
};
/** Motivos tras los cuales NO se propone respuesta automática alguna (solo resumen para la persona). */
const NO_REPLY_REASONS = new Set([
  'cliente_existente',
  'urgencia',
  'queja',
  'hablar_con_persona',
  'mensaje_no_texto',
  'fuera_de_alcance',
  'baja_confianza',
  'instruccion_sospechosa',
  'fuera_de_ventana',
  'spam',
]);

function clean(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

/** ¿La respuesta propuesta rompe alguna regla? Devuelve la etiqueta de la regla rota, o null si está limpia. */
export function replyViolation(reply: string): string | null {
  const f = fold(reply);
  if (PRICE_IN_REPLY.some((r) => r.test(f))) return 'precio';
  if (COMMITMENT_IN_REPLY.some((r) => r.test(f))) return 'compromiso';
  if (SENSITIVE_IN_REPLY.test(f)) return 'dato_sensible';
  if (LINK_IN_REPLY.test(f)) return 'enlace';
  return null;
}

/** Recorta a un límite sin cortar a media frase si se puede. */
function limit(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '), cut.lastIndexOf('.'));
  return end > max * 0.5 ? cut.slice(0, end + 1) : cut.trimEnd() + '…';
}

export function applyHardRules(raw: RawAnalysis, ctx: GuardContext): GuardedSuggestion {
  const flags: string[] = [];
  const reasons: string[] = [];
  const addReason = (r: string) => {
    if (!reasons.includes(r)) reasons.push(r);
  };

  const category: CopilotCategory = (COPILOT_CATEGORIES as readonly string[]).includes(raw.category ?? '')
    ? (raw.category as CopilotCategory)
    : 'informacion_general';
  const service: CopilotService | null = (COPILOT_SERVICES as readonly string[]).includes(raw.service ?? '')
    ? (raw.service as CopilotService)
    : null;
  const confidence = typeof raw.confidence === 'number' && Number.isFinite(raw.confidence) ? Math.min(1, Math.max(0, raw.confidence)) : 0;
  const lead = {
    name: clean(raw.lead?.name, 80),
    location: clean(raw.lead?.location, 120),
    details: clean(raw.lead?.details, 400),
  };
  const missing = Array.isArray(raw.missing)
    ? raw.missing.map((m) => clean(m, 120)).filter((m): m is string => !!m).slice(0, 3)
    : [];
  const text = fold(ctx.recentInboundText);

  // ── Derivación (R3): cualquiera de las señales basta; el código no depende de lo que diga la IA.
  if (ctx.clientExists || EXISTING_CLIENT.test(text) || category === 'cliente_existente') addReason('cliente_existente');
  if (URGENCY.test(text) || category === 'urgencia') addReason('urgencia');
  if (COMPLAINT.test(text) || category === 'queja') addReason('queja');
  if (WANTS_PERSON.test(text) || category === 'hablar_con_persona') addReason('hablar_con_persona');
  if (PROMPT_INJECTION.test(text)) addReason('instruccion_sospechosa');
  if (category === 'spam') addReason('spam');
  if (category === 'fuera_de_alcance' || service === 'otro') addReason('fuera_de_alcance');
  if (NON_TEXT_TYPES.has(ctx.lastInboundType) && text.length < 15) addReason('mensaje_no_texto');
  if (category === 'mensaje_no_texto') addReason('mensaje_no_texto');
  if (confidence < MIN_CONFIDENCE) addReason('baja_confianza');
  if (!ctx.withinWindow) addReason('fuera_de_ventana');
  // Precio: se deriva a una persona, pero se conserva una respuesta limpia que explique que el costo depende de la visita.
  if (PRICE_ASK.test(text) || category === 'precio') addReason('precio');
  if (raw.escalate === true && reasons.length === 0) addReason('ia');

  // ── Respuesta propuesta.
  let reply: string | null = clean(raw.reply, 4000);
  const hardNoReply = reasons.some((r) => NO_REPLY_REASONS.has(r));
  if (hardNoReply) {
    if (reply) flags.push('respuesta_descartada_por_derivacion');
    reply = null;
  }
  if (reply) {
    reply = reply.replace(EMOJI, '').replace(/\s{2,}/g, ' ').trim();
    const violation = replyViolation(reply);
    if (violation) {
      flags.push(`respuesta_descartada_${violation}`);
      reply = null;
      addReason('sin_respuesta_segura');
    }
  }
  if (reply) reply = limit(reply, MAX_REPLY_CHARS);
  if (reply) {
    const parts: string[] = [];
    if (ctx.needsDisclosure) {
      parts.push(DISCLOSURE);
      flags.push('aviso_asistente_virtual');
    }
    parts.push(reply);
    if (!ctx.workingHours) {
      parts.push(OFFICE_HOURS_NOTE);
      flags.push('horario_de_atencion');
    }
    reply = parts.join(' ');
  }

  const escalate = reasons.length > 0;
  const kind: SuggestionKind = reply ? 'responder' : escalate ? 'derivar' : 'ninguna';
  const summary =
    clean(raw.summary, 500) ?? clean(ctx.recentInboundText, 300) ?? 'Mensaje sin texto.';

  return {
    category,
    summary,
    service,
    lead,
    missing,
    escalate,
    escalationReasons: reasons.map((r) => REASON_LABEL[r] ?? r),
    reply,
    confidence,
    kind,
    flags,
  };
}
