/** Lo que interesa de un mensaje entrante del webhook de Meta, ya aplanado para la bandeja. */
export interface ParsedInbound {
  waId: string;
  /** Teléfono tal como lo manda Meta (solo dígitos con código de país). */
  from: string;
  profileName?: string;
  type: string;
  body?: string;
  mediaId?: string;
  mime?: string;
  filename?: string;
  /** Hora del mensaje según Meta. */
  sentAt: Date;
}

/** Aviso de estado de un mensaje que enviamos (sent, delivered, read, failed). */
export interface ParsedStatus {
  waId: string;
  status: string;
  sentAt: Date;
  error?: string;
}

interface RawMessage {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string; mime_type?: string; caption?: string };
  video?: { id?: string; mime_type?: string; caption?: string };
  audio?: { id?: string; mime_type?: string };
  sticker?: { id?: string; mime_type?: string };
  document?: { id?: string; mime_type?: string; filename?: string; caption?: string };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  button?: { text?: string };
}

interface RawStatus {
  id?: string;
  status?: string;
  timestamp?: string;
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
}

const fromEpoch = (ts?: string): Date => {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date();
};

/** Saca de un `messages[]` de Meta el tipo, el texto visible y el adjunto, si lo hay. */
function describe(m: RawMessage): Pick<ParsedInbound, 'type' | 'body' | 'mediaId' | 'mime' | 'filename'> | null {
  const type = m.type ?? 'unknown';
  switch (type) {
    case 'text':
      return { type, body: m.text?.body };
    case 'image':
      return { type, body: m.image?.caption, mediaId: m.image?.id, mime: m.image?.mime_type };
    case 'video':
      return { type, body: m.video?.caption, mediaId: m.video?.id, mime: m.video?.mime_type };
    case 'audio':
      return { type, mediaId: m.audio?.id, mime: m.audio?.mime_type };
    case 'sticker':
      return { type, mediaId: m.sticker?.id, mime: m.sticker?.mime_type };
    case 'document':
      return {
        type,
        body: m.document?.caption,
        mediaId: m.document?.id,
        mime: m.document?.mime_type,
        filename: m.document?.filename,
      };
    case 'location': {
      const { latitude, longitude, name, address } = m.location ?? {};
      if (latitude == null || longitude == null) return { type, body: 'Ubicación' };
      const label = [name, address].filter(Boolean).join(' · ');
      return {
        type,
        body: `${label ? `${label}\n` : ''}https://www.google.com/maps?q=${latitude},${longitude}`,
      };
    }
    case 'interactive':
      return { type, body: m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title };
    case 'button':
      // Toque en un botón de respuesta rápida de una plantilla nuestra.
      return { type, body: m.button?.text };
    case 'reaction':
      return null; // Una reacción no es un mensaje que haya que atender.
    default:
      return { type, body: 'Mensaje de un tipo que la bandeja aún no muestra' };
  }
}

/** Mensajes entrantes y avisos de estado del cuerpo que manda Meta (`entry[].changes[].value`). */
export function parseWebhook(body: unknown): { messages: ParsedInbound[]; statuses: ParsedStatus[] } {
  const messages: ParsedInbound[] = [];
  const statuses: ParsedStatus[] = [];
  const entries = (body as { entry?: unknown[] } | null)?.entry;
  if (!Array.isArray(entries)) return { messages, statuses };

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] }).changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> }).value;
      if (!value) continue;

      const names = new Map<string, string>();
      for (const c of (value.contacts as { wa_id?: string; profile?: { name?: string } }[] | undefined) ?? []) {
        if (c.wa_id && c.profile?.name) names.set(c.wa_id, c.profile.name);
      }

      for (const raw of (value.messages as RawMessage[] | undefined) ?? []) {
        if (!raw.id || !raw.from) continue;
        const d = describe(raw);
        if (!d) continue;
        messages.push({
          waId: raw.id,
          from: raw.from.replace(/\D/g, ''),
          profileName: names.get(raw.from),
          sentAt: fromEpoch(raw.timestamp),
          ...d,
        });
      }

      for (const raw of (value.statuses as RawStatus[] | undefined) ?? []) {
        if (!raw.id || !raw.status) continue;
        const e = raw.errors?.[0];
        statuses.push({
          waId: raw.id,
          status: raw.status,
          sentAt: fromEpoch(raw.timestamp),
          error: e ? [e.code, e.error_data?.details ?? e.message ?? e.title].filter(Boolean).join(' · ') : undefined,
        });
      }
    }
  }
  return { messages, statuses };
}

/** Vista previa corta para la lista de conversaciones. */
export function previewOf(type: string, body?: string | null): string {
  const text = (body ?? '').replace(/\s+/g, ' ').trim();
  if (text) return text.length > 120 ? `${text.slice(0, 119)}…` : text;
  const labels: Record<string, string> = {
    image: 'Foto',
    video: 'Video',
    audio: 'Nota de voz',
    document: 'Documento',
    sticker: 'Sticker',
    location: 'Ubicación',
  };
  return labels[type] ?? 'Mensaje';
}

/**
 * Resumen para el log de un cuerpo de webhook: solo cantidades y tipos, nunca textos ni números de
 * teléfono (los logs de Docker no deben guardar lo que escriben los clientes).
 */
export function summarizeWebhook(body: unknown): string {
  const types: string[] = [];
  const statuses: string[] = [];
  const entries = (body as { entry?: unknown[] } | null)?.entry;
  if (Array.isArray(entries)) {
    for (const entry of entries) {
      const changes = (entry as { changes?: unknown[] } | null)?.changes;
      if (!Array.isArray(changes)) continue;
      for (const change of changes) {
        const value = (change as { value?: { messages?: unknown[]; statuses?: unknown[] } } | null)?.value;
        for (const m of Array.isArray(value?.messages) ? value.messages : []) {
          types.push(safeTag((m as { type?: unknown } | null)?.type));
        }
        for (const s of Array.isArray(value?.statuses) ? value.statuses : []) {
          statuses.push(safeTag((s as { status?: unknown } | null)?.status));
        }
      }
    }
  }
  return `mensajes=${types.length}${types.length ? ` [${types.join(',')}]` : ''} estados=${statuses.length}${statuses.length ? ` [${statuses.join(',')}]` : ''}`;
}

/** Etiqueta corta y sin caracteres raros: lo que venga en un campo "type" no debe colar texto libre al log. */
function safeTag(v: unknown): string {
  return typeof v === 'string' && /^[a-z_]{1,20}$/.test(v) ? v : '?';
}

/** ¿`incoming` es más nuevo que `current`? (los avisos de Meta llegan desordenados). Sin fecha previa, sí. */
export function isNewerThan(current: Date | null | undefined, incoming: Date): boolean {
  return !current || current.getTime() < incoming.getTime();
}
