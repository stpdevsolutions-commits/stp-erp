import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import {
  RawScan,
  SCAN_SCHEMA,
  SCAN_SYSTEM_PROMPT,
  SCAN_USER_PROMPT,
  extractJsonObject,
} from './invoice-scan';

export type ScanProvider = 'gemini' | 'claude';

/**
 * Alias "latest": Google lo apunta al flash vigente, así que no se retira (el 2.5 ya salió de
 * servicio) ni depende de la cuota de un modelo concreto (el 3.6 fijo devolvió 429 al probar).
 * Se cambia con GEMINI_SCAN_MODEL, o con GEMINI_MODEL, que ya fija la extracción de precios.
 */
const GEMINI_DEFAULT_MODEL = 'gemini-flash-latest';
const CLAUDE_DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

const UNREADABLE =
  'No pudimos leer los datos de esta factura. Asegúrate de que la foto sea clara, esté bien enfocada y se vea completa.';

/**
 * Lee una factura (foto o PDF) con un modelo de IA y devuelve lo que "cree" haber leído,
 * SIN confiar en ello: `normalizeScan` lo contrasta con las reglas fiscales después.
 *
 * Proveedor: Claude si hay `ANTHROPIC_API_KEY`, si no Gemini (`GEMINI_API_KEY`, que el ERP
 * ya usa para importar precios). `INVOICE_SCAN_PROVIDER` fuerza uno. La clave y el modelo
 * se cambian por entorno, sin tocar código.
 */
@Injectable()
export class InvoiceScanService {
  private readonly logger = new Logger(InvoiceScanService.name);
  private gemini: GoogleGenAI | null = null;

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

  async read(buffer: Buffer, mimeType: string): Promise<{ raw: RawScan; provider: ScanProvider }> {
    const provider = this.provider();
    if (!provider) {
      throw new ServiceUnavailableException(
        'El escaneo con IA no está configurado en el servidor (falta la clave del modelo). Registra la factura a mano.',
      );
    }
    const text = provider === 'claude' ? await this.callClaude(buffer, mimeType) : await this.callGemini(buffer, mimeType);

    try {
      return { raw: JSON.parse(extractJsonObject(text)) as RawScan, provider };
    } catch {
      this.logger.error(`Respuesta no parseable (${provider}): ${text.slice(0, 400)}`);
      throw new UnprocessableEntityException(UNREADABLE);
    }
  }

  private async callGemini(buffer: Buffer, mimeType: string): Promise<string> {
    const model =
      this.config.get<string>('GEMINI_SCAN_MODEL') ?? this.config.get<string>('GEMINI_MODEL') ?? GEMINI_DEFAULT_MODEL;
    this.gemini ??= new GoogleGenAI({ apiKey: this.config.get<string>('GEMINI_API_KEY') });
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
        // Tope de espera: sin esto, con Google saturado (503) o la cuota agotada (429), el SDK
        // reintentaba con esperas largas y una lectura llegó a tardar casi 3 minutos. Con
        // 30 s por intento y un solo reintento, lo peor que espera la persona es ~1 minuto.
      }, { timeout: 30_000, maxRetries: 1 });
      return interaction.output_text ?? '';
    } catch (err) {
      throw this.providerError('gemini', err);
    }
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
  private providerError(provider: ScanProvider, err: unknown): ServiceUnavailableException {
    const detail = (err as Error).message ?? '';
    this.logger.error(`El escaneo falló (${provider}): ${detail}`);
    // 429 / cuota: no es "reintenta en un rato", es que el límite del servicio se agotó.
    if (/\b429\b|quota|rate.?limit/i.test(detail)) {
      return new ServiceUnavailableException(
        'Se agotó el límite de lecturas con IA del servicio. Se restablece más tarde; mientras tanto registra la factura a mano.',
      );
    }
    return new ServiceUnavailableException(
      'El servicio de escaneo no respondió. Espera unos minutos e inténtalo de nuevo, o registra la factura a mano.',
    );
  }
}
