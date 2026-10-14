import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import {
  RawScan,
  SCAN_SCHEMA,
  SCAN_SYSTEM_PROMPT,
  SCAN_USER_PROMPT,
  extractJsonObject,
} from './invoice-scan';
import { ScanUnavailableException, isTransientDetail, isTransientScanError } from './scan-retry';

export type ScanProvider = 'gemini' | 'claude';

/**
 * Alias "latest": Google lo apunta al flash vigente, así que no se retira (el 2.5 ya salió de
 * servicio) ni depende de la cuota de un modelo concreto (el 3.6 fijo devolvió 429 al probar).
 * Se cambia con GEMINI_SCAN_MODEL, o con GEMINI_MODEL, que ya fija la extracción de precios.
 */
const GEMINI_DEFAULT_MODEL = 'gemini-flash-latest';
/** Respaldo cuando el modelo principal responde 503/429 (modelo más ligero, otra cola de demanda). */
const GEMINI_FALLBACK_MODEL = 'gemini-flash-lite-latest';
const CLAUDE_DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

const UNREADABLE =
  'No pudimos leer los datos de esta factura. Asegúrate de que la foto sea clara, esté bien enfocada y se vea completa.';

/**
 * Lee una factura (foto o PDF) con un modelo de IA y devuelve lo que "cree" haber leído,
 * SIN confiar en ello: `normalizeScan` lo contrasta con las reglas fiscales después.
 *
 * Proveedor preferido: Claude si hay `ANTHROPIC_API_KEY`, si no Gemini (`GEMINI_API_KEY`, que el
 * ERP ya usa para importar precios). `INVOICE_SCAN_PROVIDER` elige cuál va primero. Si hay clave
 * de los dos y el preferido falla (cuota agotada, saldo, caída), se prueba con el otro; en la
 * lectura siguiente se vuelve a empezar por el preferido, así que regresa solo cuando se recupera.
 * La clave y el modelo se cambian por entorno, sin tocar código.
 */
@Injectable()
export class InvoiceScanService {
  private readonly logger = new Logger(InvoiceScanService.name);
  private gemini: GoogleGenAI | null = null;
  /** Si Claude respondió 400/401/403 (saldo agotado, clave mala) no se vuelve a llamar hasta esta hora. */
  private claudeBlockedUntil = 0;

  constructor(private readonly config: ConfigService) {}

  /** Qué proveedor se usaría ahora, o null si no hay ninguna clave configurada. */
  provider(): ScanProvider | null {
    const claude = !!this.config.get<string>('ANTHROPIC_API_KEY');
    const gemini = !!this.config.get<string>('GEMINI_API_KEY');
    const forced = this.config.get<string>('INVOICE_SCAN_PROVIDER');
    if (forced === 'claude' && claude) return 'claude';
    if (forced === 'gemini' && gemini) return 'gemini';
    if (claude) return 'claude';
    if (gemini) return 'gemini';
    return null;
  }

  /** Proveedores en orden de intento: el preferido y, si tiene clave, el otro como respaldo. */
  providers(): ScanProvider[] {
    const primary = this.provider();
    if (!primary) return [];
    const other: ScanProvider = primary === 'claude' ? 'gemini' : 'claude';
    const hasKey = this.config.get<string>(other === 'claude' ? 'ANTHROPIC_API_KEY' : 'GEMINI_API_KEY');
    return hasKey ? [primary, other] : [primary];
  }

  async read(buffer: Buffer, mimeType: string): Promise<{ raw: RawScan; provider: ScanProvider }> {
    const all = this.providers();
    // Claude sin saldo/clave inválida: se salta unos minutos para no gastar una llamada que fallará igual,
    // salvo que sea el único proveedor.
    const skipClaude = Date.now() < this.claudeBlockedUntil && all.some((p) => p !== 'claude');
    const order = skipClaude ? all.filter((p) => p !== 'claude') : all;
    if (order.length === 0) {
      throw new ScanUnavailableException(
        'El escaneo con IA no está configurado en el servidor (falta la clave del modelo). Registra la factura a mano.',
        false,
      );
    }

    let firstError: unknown;
    let firstTransient: unknown;
    for (const [i, provider] of order.entries()) {
      try {
        const text =
          provider === 'claude' ? await this.callClaude(buffer, mimeType) : await this.callGemini(buffer, mimeType);
        try {
          return { raw: JSON.parse(extractJsonObject(text)) as RawScan, provider };
        } catch {
          this.logger.error(`Respuesta no parseable (${provider}): ${text.slice(0, 400)}`);
          throw new UnprocessableEntityException(UNREADABLE);
        }
      } catch (err) {
        // Al usuario le llega el error del preferido; el del respaldo solo queda en el log.
        firstError ??= err;
        if (isTransientScanError(err)) firstTransient ??= err;
        if (i < order.length - 1) this.logger.warn(`${provider} falló; se prueba con ${order[i + 1]}`);
      }
    }
    // Si algún proveedor falló por saturación, ese es el error que se muestra: así quien llama sabe que
    // reintentar tiene sentido aunque el preferido haya fallado por algo permanente (p. ej. saldo de Claude).
    throw firstTransient ?? firstError;
  }

  private async callGemini(buffer: Buffer, mimeType: string): Promise<string> {
    const primary =
      this.config.get<string>('GEMINI_SCAN_MODEL') ?? this.config.get<string>('GEMINI_MODEL') ?? GEMINI_DEFAULT_MODEL;
    // Si el modelo principal está saturado (503) o sin cuota (429), se prueba con otro de Google antes de rendirse.
    const fallback = this.config.get<string>('GEMINI_SCAN_FALLBACK_MODEL') ?? GEMINI_FALLBACK_MODEL;
    const models = fallback && fallback !== primary ? [primary, fallback] : [primary];
    this.gemini ??= new GoogleGenAI({ apiKey: this.config.get<string>('GEMINI_API_KEY') });
    let lastError: unknown;
    for (const [i, model] of models.entries()) {
      try {
        const interaction = await this.gemini.interactions.create({
          model,
          system_instruction: SCAN_SYSTEM_PROMPT,
          input: [
            mimeType === 'application/pdf'
              ? { type: 'document', data: buffer.toString('base64'), mime_type: 'application/pdf' }
              : { type: 'image', data: buffer.toString('base64'), mime_type: mimeType },
            { type: 'text', text: SCAN_USER_PROMPT },
          ],
          response_format: { type: 'text', mime_type: 'application/json', schema: SCAN_SCHEMA },
          // Tope de espera por intento: sin esto, con Google saturado el SDK reintentaba con esperas largas.
        }, { timeout: 30_000, maxRetries: 1 });
        return interaction.output_text ?? '';
      } catch (err) {
        lastError = err;
        // Un 400/401/403 no se arregla cambiando de modelo: se corta aquí.
        if (!isTransientDetail((err as Error).message ?? '', (err as { status?: number }).status)) break;
        if (i < models.length - 1) {
          this.logger.warn(`Gemini (${model}) falló: ${(err as Error).message?.slice(0, 120)}; se prueba con ${models[i + 1]}`);
        }
      }
    }
    throw this.providerError('gemini', lastError);
  }

  private async callClaude(buffer: Buffer, mimeType: string): Promise<string> {
    const model = this.config.get<string>('ANTHROPIC_MODEL') ?? CLAUDE_DEFAULT_MODEL;
    const data = buffer.toString('base64');
    const file =
      mimeType === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
        : { type: 'image', source: { type: 'base64', media_type: mimeType, data } };
    // Una clave de usuario (sk-ant-usr-…) no va atada a un workspace: Anthropic exige decir cuál.
    const workspaceId = this.config.get<string>('ANTHROPIC_WORKSPACE_ID');
    try {
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
          max_tokens: 1024,
          system: SCAN_SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: [
                file,
                {
                  type: 'text',
                  text: `${SCAN_USER_PROMPT}\nResponde SOLO con un objeto JSON que cumpla este esquema, sin texto adicional:\n${JSON.stringify(SCAN_SCHEMA)}`,
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
      const parsed = JSON.parse(body) as { content?: { type: string; text?: string }[] };
      return parsed.content?.find((c) => c.type === 'text')?.text ?? '';
    } catch (err) {
      throw this.providerError('claude', err);
    }
  }

  /** El detalle técnico va al log; al usuario, algo que pueda entender y hacer. */
  private providerError(provider: ScanProvider, err: unknown): ScanUnavailableException {
    const detail = (err as Error).message ?? '';
    const transient = isTransientDetail(detail, (err as { status?: number }).status);
    if (provider === 'claude' && !transient && /\bHTTP (400|401|403)\b/.test(detail)) {
      this.claudeBlockedUntil = Date.now() + 10 * 60_000;
    }
    this.logger.error(`El escaneo falló (${provider}): ${detail}`);
    // 429 / cuota: no es "reintenta en un rato", es que el límite del servicio se agotó.
    if (/\b429\b|quota|rate.?limit/i.test(detail)) {
      return new ScanUnavailableException(
        'Se agotó el límite de lecturas con IA del servicio. Se restablece más tarde; mientras tanto registra la factura a mano.',
        transient,
      );
    }
    return new ScanUnavailableException(
      'El servicio de escaneo no respondió. Espera unos minutos e inténtalo de nuevo, o registra la factura a mano.',
      transient,
    );
  }
}
