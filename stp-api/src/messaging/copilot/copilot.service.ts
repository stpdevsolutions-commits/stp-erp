import { ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WaContact } from '../entities/wa-contact.entity';
import { WaMessage, MessageDirection } from '../entities/wa-message.entity';
import { WaSuggestion } from '../entities/wa-suggestion.entity';
import { MessagingService, isWorkingHours } from '../messaging.service';
import { auditLog } from '../../common/audit-log';
import { CopilotEngine, CopilotUnavailableError, type ChatLine, type EngineInput } from './copilot-engine';
import { applyHardRules, type GuardContext, type GuardedSuggestion } from './copilot-guard';
import { HISTORY_MESSAGES, SERVICE_LABELS, type CopilotService as ServiceKey } from './copilot-rules';

const WINDOW_MS = 24 * 60 * 60 * 1000;
const NOTES_MAX = 4000;

/** Lo que muestra la bandeja de una sugerencia. */
export interface SuggestionView {
  id: string;
  status: string;
  kind: string;
  category: string | null;
  summary: string | null;
  service: string | null;
  serviceLabel: string | null;
  lead: { name: string | null; location: string | null; details: string | null };
  missing: string[];
  escalate: boolean;
  escalationReasons: string[];
  reply: string | null;
  confidence: number;
  provider: string | null;
  error: string | null;
  createdAt: Date;
  dataApplied: boolean;
}

export interface SimulateInput {
  messages: { from: 'cliente' | 'equipo'; text: string }[];
  clienteExistente?: boolean;
  primerContacto?: boolean;
  horarioLaboral?: boolean;
  tipoUltimoMensaje?: string;
}

/**
 * Copiloto de WhatsApp (ERP-56, fase 2): la IA clasifica, resume y PROPONE una respuesta; una persona la aprueba.
 * Nada sale solo. Apagado por defecto (COPILOT_ENABLED=true lo enciende). Reglas en docs/whatsapp-copiloto.md.
 */
@Injectable()
export class CopilotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CopilotService.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectRepository(WaSuggestion) private readonly suggestions: Repository<WaSuggestion>,
    @InjectRepository(WaContact) private readonly contacts: Repository<WaContact>,
    @InjectRepository(WaMessage) private readonly messages: Repository<WaMessage>,
    private readonly messaging: MessagingService,
    private readonly engine: CopilotEngine,
    private readonly config: ConfigService,
  ) {}

  get enabled(): boolean {
    return this.config.get<string>('COPILOT_ENABLED') === 'true';
  }

  private get debounceMs(): number {
    const s = Number(this.config.get<string>('COPILOT_DEBOUNCE_SECONDS') || 20);
    return Number.isFinite(s) && s >= 0 ? Math.min(s, 300) * 1000 : 20_000;
  }

  onModuleInit(): void {
    this.messaging.onInbound((contactId) => this.schedule(contactId));
    this.logger.log(this.enabled ? 'Copiloto de WhatsApp ACTIVADO (solo propone; una persona aprueba).' : 'Copiloto de WhatsApp apagado (COPILOT_ENABLED).');
  }

  onModuleDestroy(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  /** Programa el análisis tras unos segundos, juntando mensajes seguidos. Nunca lanza ni bloquea al webhook. */
  schedule(contactId: string): void {
    if (!this.enabled) return;
    this.logger.debug(`Mensaje entrante de ${contactId}: análisis en ${this.debounceMs / 1000} s`);
    const prev = this.timers.get(contactId);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      this.timers.delete(contactId);
      this.run(contactId).catch((err) => this.logger.error(`El copiloto falló con ${contactId}: ${(err as Error).message}`));
    }, this.debounceMs);
    t.unref?.();
    this.timers.set(contactId, t);
  }

  /** Analiza el último mensaje sin contestar de una conversación y guarda la sugerencia. */
  async run(contactId: string): Promise<WaSuggestion | null> {
    const contact = await this.contacts.findOne({ where: { id: contactId } });
    if (!contact) return null;
    const recent = await this.recentMessages(contactId);
    const { lastIn: last, answered } = conversationState(recent);
    // Si una persona del equipo ya contestó, no hay nada que proponer. (El acuse automático no cuenta.)
    if (!last || answered) {
      this.logger.debug(`Sin análisis para ${contactId}: no hay mensaje pendiente de contestar`);
      return null;
    }
    if (await this.suggestions.findOne({ where: { triggerMessageId: last.id }, select: { id: true } })) return null;

    // Lo que el cliente dijo desde la última respuesta del equipo.
    const tail: WaMessage[] = [];
    for (let i = recent.length - 1; i >= 0; i--) {
      const m = recent[i];
      if (m.direction === MessageDirection.OUT) {
        if (m.sentById) break; // contestó una persona: lo anterior ya está atendido
        continue; // acuse automático
      }
      tail.unshift(m);
    }
    const history: ChatLine[] = recent.map((m) => ({
      from: m.direction === MessageDirection.IN ? 'cliente' : 'equipo',
      text: lineOf(m),
    }));
    const needsDisclosure = !(await this.suggestions
      .createQueryBuilder('s')
      .where('s.contactId = :c AND s.status = :st AND s.flags @> :f', {
        c: contactId,
        st: 'sent',
        f: JSON.stringify(['aviso_asistente_virtual']),
      })
      .getExists());
    const now = new Date();
    const ctx: GuardContext = {
      clientExists: !!contact.clientId,
      needsDisclosure,
      lastInboundType: last.type,
      recentInboundText: tail.map((m) => m.body ?? '').join('\n'),
      withinWindow: !!contact.lastInboundAt && now.getTime() - contact.lastInboundAt.getTime() <= WINDOW_MS,
      workingHours: isWorkingHours(now),
    };
    const input: EngineInput = {
      history,
      clientName: contact.name,
      clientExists: ctx.clientExists,
      firstContact: needsDisclosure,
      workingHours: ctx.workingHours,
    };

    let row: Partial<WaSuggestion>;
    try {
      const { raw, provider, model } = await this.engine.analyze(input);
      const g = applyHardRules(raw, ctx);
      row = { ...fromGuarded(g), status: 'pending', provider, model };
    } catch (err) {
      const msg = err instanceof CopilotUnavailableError ? err.message : (err as Error).message;
      this.logger.warn(`Sin sugerencia para ${contactId}: ${msg?.slice(0, 200)}`);
      row = { status: 'failed', kind: 'ninguna', error: (msg ?? 'La IA no respondió').slice(0, 400) };
    }
    const saved = await this.suggestions.save(this.suggestions.create({ ...row, contactId, triggerMessageId: last.id }));
    await this.suggestions
      .createQueryBuilder()
      .update(WaSuggestion)
      .set({ status: 'superseded', resolvedAt: () => 'now()' })
      .where('"contactId" = :c AND status IN (\'pending\', \'failed\') AND id <> :id', { c: contactId, id: saved.id })
      .execute();
    return saved;
  }

  // ── Lo que ve y hace la persona ────────────────────────────────────────────

  /** La sugerencia vigente de una conversación, o null si ya no aplica (contestó alguien o llegó algo nuevo). */
  async getForContact(contactId: string): Promise<SuggestionView | null> {
    const { lastIn: last, answered } = conversationState(await this.recentMessages(contactId));
    if (!last || answered) return null;
    const s = await this.suggestions.findOne({ where: { contactId }, order: { createdAt: 'DESC' } });
    if (!s || s.triggerMessageId !== last.id || (s.status !== 'pending' && s.status !== 'failed')) return null;
    return toView(s);
  }

  async send(userId: string, id: string, text?: string): Promise<{ id: string; sentAt: Date; status: string }> {
    const s = await this.mustExist(id);
    if (s.status !== 'pending') throw new ConflictException('Esta sugerencia ya se resolvió.');
    await this.assertStillCurrent(s);
    const body = (text ?? s.reply ?? '').trim();
    if (!body) throw new BadRequestException('No hay texto para enviar: escribe la respuesta.');
    if (body.length > 4000) throw new BadRequestException('El mensaje es demasiado largo (máximo 4000 caracteres).');

    // Se reclama antes de enviar: dos personas pulsando a la vez no mandan dos mensajes.
    const claimed = await this.suggestions.update({ id, status: 'pending' }, { status: 'sent', resolvedById: userId, resolvedAt: new Date() });
    if (!claimed.affected) throw new ConflictException('Otra persona acaba de resolver esta sugerencia.');
    try {
      const sent = await this.messaging.sendText(userId, s.contactId, body);
      await this.suggestions.update(id, { sentMessageId: sent.id, edited: body !== (s.reply ?? '').trim() });
      auditLog(userId, 'whatsapp.copilot.send', { suggestionId: id, contactId: s.contactId, edited: body !== (s.reply ?? '').trim() });
      return sent;
    } catch (err) {
      await this.suggestions.update(id, { status: 'pending', resolvedById: null as never, resolvedAt: null as never });
      throw err;
    }
  }

  async discard(userId: string, id: string): Promise<void> {
    const s = await this.mustExist(id);
    if (s.status !== 'pending' && s.status !== 'failed') throw new ConflictException('Esta sugerencia ya se resolvió.');
    await this.suggestions.update(id, { status: 'discarded', resolvedById: userId, resolvedAt: new Date() });
    auditLog(userId, 'whatsapp.copilot.discard', { suggestionId: id, contactId: s.contactId });
  }

  /** Copia al lead lo que la IA entendió (servicio, nombre, resumen) sin tocar lo que una persona ya escribió. */
  async applyData(userId: string, id: string): Promise<{ service: string | null; name: string | null; notes: string | null }> {
    const s = await this.mustExist(id);
    if (s.status !== 'pending') throw new ConflictException('Esta sugerencia ya se resolvió.');
    if (s.flags?.includes('datos_aplicados')) throw new ConflictException('Los datos ya se aplicaron al lead.');
    const c = await this.contacts.findOne({ where: { id: s.contactId } });
    if (!c) throw new NotFoundException('Conversación no encontrada');
    const patch: Partial<WaContact> = {};
    if (!c.service && s.service && s.service !== 'otro') patch.service = SERVICE_LABELS[s.service as ServiceKey] ?? s.service;
    if (!c.name && s.lead?.name) patch.name = s.lead.name;
    const day = new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);
    const parts = [s.summary, s.lead?.location && `Ubicación: ${s.lead.location}`, s.lead?.details && `Detalles: ${s.lead.details}`].filter(Boolean);
    if (parts.length) {
      const note = `[Asistente ${day}] ${parts.join(' · ')}`;
      patch.notes = [c.notes, note].filter(Boolean).join('\n').slice(0, NOTES_MAX);
    }
    if (Object.keys(patch).length) await this.contacts.update(c.id, patch);
    await this.suggestions.update(id, { flags: [...(s.flags ?? []), 'datos_aplicados'] });
    auditLog(userId, 'whatsapp.copilot.apply', { suggestionId: id, contactId: c.id });
    return { service: patch.service ?? c.service ?? null, name: patch.name ?? c.name ?? null, notes: patch.notes ?? c.notes ?? null };
  }

  /** Prueba con mensajes de ejemplo: no guarda nada ni toca ninguna conversación real. */
  async simulate(input: SimulateInput): Promise<{ suggestion: GuardedSuggestion; provider: string; model: string; raw: unknown }> {
    const lines = input.messages.map((m) => ({ from: m.from, text: m.text }));
    const tail: string[] = [];
    for (let i = lines.length - 1; i >= 0 && lines[i].from === 'cliente'; i--) tail.unshift(lines[i].text);
    const ctx: GuardContext = {
      clientExists: input.clienteExistente ?? false,
      needsDisclosure: input.primerContacto ?? true,
      lastInboundType: input.tipoUltimoMensaje ?? 'text',
      recentInboundText: tail.join('\n'),
      withinWindow: true,
      workingHours: input.horarioLaboral ?? true,
    };
    const { raw, provider, model } = await this.engine.analyze({
      history: lines,
      clientExists: ctx.clientExists,
      firstContact: ctx.needsDisclosure,
      workingHours: ctx.workingHours,
    });
    return { suggestion: applyHardRules(raw, ctx), provider, model, raw };
  }

  /** Los últimos mensajes de una conversación, del más viejo al más nuevo. */
  private async recentMessages(contactId: string): Promise<WaMessage[]> {
    return (await this.messages.find({ where: { contactId }, order: { sentAt: 'DESC' }, take: HISTORY_MESSAGES })).reverse();
  }

  private async mustExist(id: string): Promise<WaSuggestion> {
    const s = await this.suggestions.findOne({ where: { id } });
    if (!s) throw new NotFoundException('Sugerencia no encontrada');
    return s;
  }

  /** Si alguien ya contestó o llegó otro mensaje, la sugerencia quedó vieja. */
  private async assertStillCurrent(s: WaSuggestion): Promise<void> {
    const { lastIn: last, answered } = conversationState(await this.recentMessages(s.contactId));
    if (!last || answered || last.id !== s.triggerMessageId) {
      await this.suggestions.update({ id: s.id, status: 'pending' }, { status: 'superseded', resolvedAt: new Date() });
      throw new ConflictException('Llegó un mensaje nuevo o alguien ya contestó: revisa la conversación.');
    }
  }
}

/**
 * Último mensaje del cliente y si una PERSONA del equipo ya contestó después. El acuse automático que el sistema
 * manda a un número desconocido (sin usuario que lo envíe) no cuenta como respuesta.
 */
export function conversationState(recent: WaMessage[]): { lastIn: WaMessage | undefined; answered: boolean } {
  const lastIn = [...recent].reverse().find((m) => m.direction === MessageDirection.IN);
  if (!lastIn) return { lastIn: undefined, answered: false };
  const t = new Date(lastIn.sentAt).getTime();
  const answered = recent.some((m) => m.direction === MessageDirection.OUT && !!m.sentById && new Date(m.sentAt).getTime() > t);
  return { lastIn, answered };
}

function lineOf(m: WaMessage): string {
  const body = (m.body ?? '').trim();
  if (m.type === 'text' || m.type === 'button' || m.type === 'interactive') return body || `[${m.type}]`;
  if (m.type === 'template') return body || '[plantilla]';
  return body ? `[${m.type}] ${body}` : `[${m.type} sin texto]`;
}

function fromGuarded(g: GuardedSuggestion): Partial<WaSuggestion> {
  return {
    kind: g.kind,
    category: g.category,
    summary: g.summary,
    service: g.service,
    lead: g.lead,
    missing: g.missing,
    escalate: g.escalate,
    escalationReasons: g.escalationReasons,
    reply: g.reply,
    confidence: g.confidence,
    flags: g.flags,
  };
}

function toView(s: WaSuggestion): SuggestionView {
  return {
    id: s.id,
    status: s.status,
    kind: s.kind,
    category: s.category,
    summary: s.summary,
    service: s.service,
    serviceLabel: s.service ? (SERVICE_LABELS[s.service as ServiceKey] ?? s.service) : null,
    lead: s.lead ?? { name: null, location: null, details: null },
    missing: s.missing ?? [],
    escalate: s.escalate,
    escalationReasons: s.escalationReasons ?? [],
    reply: s.reply,
    confidence: s.confidence,
    provider: s.provider,
    error: s.status === 'failed' ? 'La IA no pudo preparar una sugerencia. Redacta la respuesta a mano.' : null,
    createdAt: s.createdAt,
    dataApplied: !!s.flags?.includes('datos_aplicados'),
  };
}
