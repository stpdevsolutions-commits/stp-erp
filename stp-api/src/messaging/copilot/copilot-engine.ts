import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { extractJsonObject } from '../../fiscal-invoices/invoice-scan';
import { isTransientDetail } from '../../fiscal-invoices/scan-retry';
import { COPILOT_SCHEMA, COPILOT_SYSTEM_PROMPT, type RawAnalysis } from './copilot-rules';

export type CopilotProvider = 'gemini' | 'claude';

const GEMINI_DEFAULT_MODEL = 'gemini-flash-latest';
const GEMINI_FALLBACK_MODEL = 'gemini-flash-lite-latest';
const CLAUDE_DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

/** Una línea de la conversación que se le muestra a la IA. */
export interface ChatLine {
  from: 'cliente' | 'equipo';
  text: string;
}

export interface EngineInput {
  history: ChatLine[];
  /** Solo hechos que la IA necesita; nunca el teléfono ni datos del cliente del ERP. */
  clientName?: string | null;
  clientExists: boolean;
  firstContact: boolean;
  workingHours: boolean;
}

export interface EngineResult {
  raw: RawAnalysis;
  provider: CopilotProvider;
  model: string;
}

/** Ningún proveedor pudo responder. `transient` dice si tiene sentido reintentar más tarde. */
export class CopilotUnavailableError extends Error {
  constructor(
    message: string,
    readonly transient: boolean,
  ) {
    super(message);
  }
}

export function buildUserPrompt(i: EngineInput): string {
  const lines = i.history.map((l) => `${l.from === 'cliente' ? 'CLIENTE' : 'EQUIPO STP'}: ${l.text.replace(/\s+/g, ' ').slice(0, 1500)}`);
  return [
    'Contexto:',
    `- Nombre de pila del cliente: ${i.clientName ? i.clientName.split(/\s+/)[0] : 'no se conoce'}`,
    `- ¿Ya es cliente de STP según el ERP?: ${i.clientExists ? 'sí' : 'no'}`,
    `- ¿Es la primera vez que STP le escribe?: ${i.firstContact ? 'sí' : 'no'}`,
    `- ¿Estamos dentro del horario de atención?: ${i.workingHours ? 'sí' : 'no'}`,
    '',
    'Conversación (de la más antigua a la más reciente; responde al último mensaje del CLIENTE):',
    '<<<',
    ...lines,
    '>>>',
    '',
    'Devuelve solo el objeto JSON.',
  ].join('\n');
}

/**
 * Motor de IA del copiloto (ERP-56 fase 2): Gemini y/o Claude por HTTP/SDK, en el orden de COPILOT_PROVIDERS.
 * Es asíncrono (nadie espera en pantalla), así que tolera reintentos: dos rondas por proveedor con espera entre ellas.
 * Un 400/401/403 (clave, saldo, petición mala) no se arregla reintentando: se pasa al siguiente proveedor.
 */
@Injectable()
export class CopilotEngine {
  private readonly logger = new Logger(CopilotEngine.name);
  private gemini: GoogleGenAI | null = null;
  private claudeBlockedUntil = 0;
  /** Modelos de Gemini con la cuota diaria agotada (capa gratuita): se saltan una hora en vez de gastar un intento por mensaje. */
  private readonly modelBlockedUntil = new Map<string, number>();
  /** Se reemplaza en las pruebas para no esperar de verdad. */
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms));

  constructor(private readonly config: ConfigService) {}

  /** Proveedores configurados y con clave, en orden de preferencia. */
  providers(): CopilotProvider[] {
    const wanted = (this.config.get<string>('COPILOT_PROVIDERS') || 'gemini,claude')
      .split(',')
      .map((p) => p.trim().toLowerCase())
      .filter((p): p is CopilotProvider => p === 'gemini' || p === 'claude');
    return wanted.filter((p) => (p === 'gemini' ? !!this.config.get('GEMINI_API_KEY') : !!this.config.get('ANTHROPIC_API_KEY')));
  }

  async analyze(input: EngineInput): Promise<EngineResult> {
    const providers = this.providers();
    if (providers.length === 0) throw new CopilotUnavailableError('No hay ninguna clave de IA configurada.', false);
    const user = buildUserPrompt(input);
    let firstError: Error | undefined;
    let anyTransient = false;
    for (const provider of providers) {
      if (provider === 'claude' && Date.now() < this.claudeBlockedUntil && providers.some((p) => p !== 'claude')) continue;
      for (let round = 0; round < 2; round++) {
        try {
          const { text, model } = provider === 'gemini' ? await this.callGemini(user) : await this.callClaude(user);
          let raw: RawAnalysis;
          try {
            raw = JSON.parse(extractJsonObject(text)) as RawAnalysis;
          } catch {
            throw Object.assign(new Error(`Respuesta no parseable: ${text.slice(0, 200)}`), { unparseable: true });
          }
          return { raw, provider, model };
        } catch (err) {
          const e = err as Error & { status?: number; unparseable?: boolean };
          firstError ??= e;
          const transient = !!e.unparseable || isTransientDetail(e.message ?? '', e.status);
          anyTransient ||= transient;
          this.logger.warn(`Copiloto (${provider}, ronda ${round + 1}) falló: ${(e.message ?? '').slice(0, 160)}`);
          if (!transient) {
            if (provider === 'claude' && /\b(400|401|403)\b/.test(e.message ?? '')) this.claudeBlockedUntil = Date.now() + 10 * 60_000;
            break; // no se arregla reintentando: siguiente proveedor
          }
          if (round === 0) await this.sleep(4_000 + Math.floor(Math.random() * 2_000));
        }
      }
    }
    throw new CopilotUnavailableError(firstError?.message?.slice(0, 300) ?? 'La IA no respondió.', anyTransient);
  }

  private async callGemini(user: string): Promise<{ text: string; model: string }> {
    const primary = this.config.get<string>('COPILOT_GEMINI_MODEL') || GEMINI_DEFAULT_MODEL;
    const fallback = this.config.get<string>('COPILOT_GEMINI_FALLBACK_MODEL') || GEMINI_FALLBACK_MODEL;
    const all = fallback && fallback !== primary ? [primary, fallback] : [primary];
    const available = all.filter((m) => (this.modelBlockedUntil.get(m) ?? 0) <= Date.now());
    const models = available.length ? available : all;
    this.gemini ??= new GoogleGenAI({ apiKey: this.config.get<string>('GEMINI_API_KEY') });
    let last: unknown;
    for (const model of models) {
      try {
        const interaction = await this.gemini.interactions.create(
          {
            model,
            system_instruction: COPILOT_SYSTEM_PROMPT,
            input: [{ type: 'text', text: user }],
            response_format: { type: 'text', mime_type: 'application/json', schema: COPILOT_SCHEMA },
          },
          { timeout: 30_000, maxRetries: 0 },
        );
        return { text: interaction.output_text ?? '', model };
      } catch (err) {
        last = err;
        if (/per day|perday|daily/i.test((err as Error).message ?? '')) {
          this.modelBlockedUntil.set(model, Date.now() + 60 * 60_000);
          this.logger.warn(`Gemini (${model}) sin cuota diaria; se salta durante una hora.`);
        }
        if (!isTransientDetail((err as Error).message ?? '', (err as { status?: number }).status)) break;
      }
    }
    throw last;
  }

  private async callClaude(user: string): Promise<{ text: string; model: string }> {
    const model = this.config.get<string>('COPILOT_CLAUDE_MODEL') || CLAUDE_DEFAULT_MODEL;
    const workspaceId = this.config.get<string>('ANTHROPIC_WORKSPACE_ID');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.config.get<string>('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        ...(workspaceId ? { 'anthropic-workspace-id': workspaceId } : {}),
      },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        system: COPILOT_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `${user}\n\nResponde SOLO con un objeto JSON que cumpla este esquema, sin texto adicional:\n${JSON.stringify(COPILOT_SCHEMA)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const body = await res.text();
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`), { status: res.status });
    const parsed = JSON.parse(body) as { content?: { type: string; text?: string }[] };
    return { text: parsed.content?.find((c) => c.type === 'text')?.text ?? '', model };
  }
}
