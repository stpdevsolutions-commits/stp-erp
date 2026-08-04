import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import {
  CleanExtraction,
  EXTRACTION_SCHEMA,
  EXTRACTION_SYSTEM_PROMPT,
  EXTRACTION_USER_PROMPT,
  RawExtraction,
  sanitizeExtraction,
} from './price-extraction';

export interface ExtractionResult extends CleanExtraction {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Modelo por defecto. Se puede fijar otro con GEMINI_MODEL sin tocar código, que es lo
 * que hará falta cuando Google jubile este: los nombres cambian más rápido que el resto
 * de la integración.
 */
const DEFAULT_MODEL = 'gemini-3.6-flash';

/**
 * Extrae precios de un PDF con la API de Gemini.
 *
 * La respuesta viene forzada a JSON con `response_format` + schema, así que aquí no hay
 * que rescatar JSON de un texto en prosa. Lo que sí hay que hacer es desconfiar de los
 * valores: de eso se ocupa `sanitizeExtraction`, en `price-extraction.ts`.
 */
@Injectable()
export class PriceExtractionService {
  private readonly logger = new Logger(PriceExtractionService.name);
  private client: GoogleGenAI | null = null;

  constructor(private readonly config: ConfigService) {}

  /** Si esto es false, el módulo entero está apagado y la API lo dice al subir el archivo. */
  isConfigured(): boolean {
    return !!this.config.get<string>('GEMINI_API_KEY');
  }

  async extract(pdf: Buffer, filename: string): Promise<ExtractionResult> {
    const client = this.getClient();
    const model = this.config.get<string>('GEMINI_MODEL') ?? DEFAULT_MODEL;

    let interaction;
    try {
      interaction = await client.interactions.create({
        model,
        system_instruction: EXTRACTION_SYSTEM_PROMPT,
        input: [
          {
            type: 'document',
            data: pdf.toString('base64'),
            mime_type: 'application/pdf',
          },
          { type: 'text', text: EXTRACTION_USER_PROMPT },
        ],
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: EXTRACTION_SCHEMA,
        },
      });
    } catch (err) {
      // Errores de cuota o del servicio. Se convierten en 503 para que el reintento de la
      // cola tenga sentido, y con el mensaje original porque "429" y "PDF ilegible" se
      // arreglan de formas muy distintas.
      const message = (err as Error).message ?? 'Error desconocido';
      this.logger.error(`Gemini falló extrayendo ${filename}: ${message}`);
      throw new ServiceUnavailableException(`La extracción falló: ${message}`);
    }

    const text = interaction.output_text;
    if (!text) {
      throw new ServiceUnavailableException(
        'El modelo no devolvió contenido. Revisa el PDF o registra los precios a mano.',
      );
    }

    let raw: RawExtraction;
    try {
      raw = JSON.parse(text) as RawExtraction;
    } catch {
      this.logger.error(`Respuesta no parseable extrayendo ${filename}: ${text.slice(0, 500)}`);
      throw new ServiceUnavailableException('La respuesta del modelo no se pudo interpretar.');
    }

    const clean = sanitizeExtraction(raw);
    this.logger.log(
      `${filename}: ${clean.lines.length} línea(s) extraída(s), ` +
        `${clean.discarded.length} descartada(s)`,
    );

    return {
      ...clean,
      model,
      inputTokens: interaction.usage?.total_input_tokens ?? 0,
      outputTokens: interaction.usage?.total_output_tokens ?? 0,
    };
  }

  private getClient(): GoogleGenAI {
    if (this.client) return this.client;
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Falta GEMINI_API_KEY: la extracción de precios por IA está desactivada.',
      );
    }
    this.client = new GoogleGenAI({ apiKey });
    return this.client;
  }
}
