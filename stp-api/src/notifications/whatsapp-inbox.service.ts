import { Injectable, Logger } from '@nestjs/common';

/** Un mensaje entrante de WhatsApp ya simplificado (lo que el webhook entrega a quien lo procese). */
export interface InboundMessage {
  id: string;
  /** Número del remitente, solo dígitos con código de país (como lo manda Meta). */
  from: string;
  type: string;
  text?: string;
  mediaId?: string;
  mime?: string;
  filename?: string;
  /** Id de la opción elegida en un botón o una lista. */
  interactiveId?: string;
}

type InboundHandler = (message: InboundMessage) => Promise<void>;

/**
 * Buzón de mensajes entrantes. El webhook (módulo de notificaciones) los deja aquí y quien sepa
 * procesarlos —hoy, el registro de facturas por WhatsApp— se registra como manejador. Existe para
 * que notificaciones no dependa de facturas (evita un ciclo entre módulos).
 */
@Injectable()
export class WhatsappInboxService {
  private readonly logger = new Logger(WhatsappInboxService.name);
  private handler?: InboundHandler;
  /** Meta reintenta la entrega si tarda: se recuerdan los ids ya vistos para no procesar dos veces. */
  private readonly seen = new Map<string, number>();
  private static readonly SEEN_TTL_MS = 60 * 60 * 1000;

  register(handler: InboundHandler): void {
    this.handler = handler;
  }

  /** Quien guarda TODO el cuerpo del webhook (mensajes y estados) para la bandeja del ERP-57. */
  private rawListener?: (body: unknown) => Promise<void>;

  registerRaw(listener: (body: unknown) => Promise<void>): void {
    this.rawListener = listener;
  }

  async dispatchRaw(body: unknown): Promise<void> {
    if (!this.rawListener) return;
    try {
      await this.rawListener(body);
    } catch (err) {
      this.logger.error(`Fallo guardando el webhook en la bandeja: ${(err as Error).message}`);
    }
  }

  async dispatch(messages: InboundMessage[]): Promise<void> {
    if (!this.handler) return;
    const now = Date.now();
    for (const [id, at] of this.seen) if (now - at > WhatsappInboxService.SEEN_TTL_MS) this.seen.delete(id);

    for (const message of messages) {
      if (this.seen.has(message.id)) continue;
      this.seen.set(message.id, now);
      try {
        await this.handler(message);
      } catch (err) {
        this.logger.error(`Fallo procesando el mensaje ${message.id}: ${(err as Error).message}`);
      }
    }
  }
}

/** Saca los mensajes del cuerpo que manda Meta (`entry[].changes[].value.messages[]`). */
export function parseInboundMessages(body: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  const entries = (body as { entry?: unknown[] } | null)?.entry;
  if (!Array.isArray(entries)) return out;

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] }).changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const messages = (change as { value?: { messages?: unknown[] } }).value?.messages;
      if (!Array.isArray(messages)) continue;
      for (const raw of messages) {
        const m = raw as {
          id?: string;
          from?: string;
          type?: string;
          text?: { body?: string };
          image?: { id?: string; mime_type?: string };
          document?: { id?: string; mime_type?: string; filename?: string };
          interactive?: { list_reply?: { id?: string }; button_reply?: { id?: string } };
        };
        if (!m.id || !m.from || !m.type) continue;
        const media = m.type === 'image' ? m.image : m.type === 'document' ? m.document : undefined;
        out.push({
          id: m.id,
          from: m.from.replace(/\D/g, ''),
          type: m.type,
          text: m.text?.body,
          mediaId: media?.id,
          mime: media?.mime_type,
          filename: m.type === 'document' ? m.document?.filename : undefined,
          interactiveId: m.interactive?.list_reply?.id ?? m.interactive?.button_reply?.id,
        });
      }
    }
  }
  return out;
}
