import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  BadGatewayException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Línea de un comprobante, tal como la espera la API de e-CF (ecf-api).
 * `precioUnitario` es SIEMPRE pre-ITBIS: ecf-api le suma el ITBIS según
 * `indicadorFacturacion` (1 = 18%, 2 = 16%, 3 = 0%, 4 = exento).
 */
export interface LineaEcf {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  indicadorFacturacion?: number;
  indicadorBienoServicio?: number;
}

export interface CrearEcfDto {
  tipoEcf: string;
  tipoPago?: number;
  rncComprador?: string;
  /** Obligatorio en ecf-api (nombreComprador! en el DTO). */
  nombreComprador: string;
  lineas: LineaEcf[];
}

export interface ResultadoEcf {
  id: string;
  encf?: string;
  estado?: string;
  uuid?: string;
  codigoSeguridadDgii?: string;
  qrUrl?: string;
  [k: string]: unknown;
}

/**
 * Cliente HTTP hacia ecf-api (proyecto eCF-SaaS, dominio aparte). Sigue el
 * mismo patrón desacoplado que ya usa el ERP con servicios externos: no
 * comparte base de datos ni autenticación de usuario, habla por HTTP con una
 * API-key de servicio (`x-api-key`). El RNC emisor lo pone ecf-api según la
 * empresa atada a esa key; aquí solo mandamos el detalle del comprobante.
 *
 * Configuración (.env):
 *   ECF_API_URL          ej. https://ecf-api.stpsoluciones.com/api
 *   ECF_SERVICE_API_KEY  la key de servicio generada en ecf-api
 */
@Injectable()
export class EcfClientService {
  private readonly logger = new Logger(EcfClientService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>('ECF_API_URL') || '').replace(/\/+$/, '');
    this.apiKey = config.get<string>('ECF_SERVICE_API_KEY') || '';
  }

  estaConfigurado(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  private async call<T = any>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    if (!this.estaConfigurado()) {
      throw new ServiceUnavailableException(
        'La integración con e-CF no está configurada (falta ECF_API_URL o ECF_SERVICE_API_KEY).',
      );
    }
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      this.logger.error(`Fallo de red hacia ecf-api ${method} ${path}: ${err}`);
      throw new BadGatewayException('No se pudo contactar el servicio de e-CF.');
    }
    const texto = await res.text();
    let data: any = null;
    try {
      data = texto ? JSON.parse(texto) : null;
    } catch {
      data = texto;
    }
    if (!res.ok) {
      const msg =
        (data && (data.message || data.error)) || `HTTP ${res.status}`;
      this.logger.warn(`ecf-api ${method} ${path} -> ${res.status}: ${JSON.stringify(msg)}`);
      throw new BadGatewayException(
        `El servicio de e-CF respondió ${res.status}: ${
          Array.isArray(msg) ? msg.join('; ') : msg
        }`,
      );
    }
    return data as T;
  }

  /**
   * Crea el comprobante y lo lleva por el ciclo completo:
   * crear → validar → firmar → (opcional) transmitir a la DGII.
   * Devuelve el estado final del comprobante. Si `transmitir` es false, se
   * queda firmado pero sin enviar (útil mientras la RNC no esté habilitada
   * como emisor electrónico en la DGII).
   */
  async emitir(
    dto: CrearEcfDto,
    opts: { transmitir: boolean },
  ): Promise<ResultadoEcf> {
    const creado = await this.call<ResultadoEcf>('POST', '/ecf', dto);
    const id = creado.id;
    await this.call('POST', `/ecf/${id}/validate`);
    await this.call('POST', `/ecf/${id}/sign`);
    if (opts.transmitir) {
      await this.call('POST', `/ecf/${id}/transmit`);
    }
    // Estado final ya con eNCF/UUID/QR poblados.
    return this.call<ResultadoEcf>('GET', `/ecf/${id}`);
  }

  /** Consulta el estado actual de un comprobante ya emitido. */
  async estado(ecfId: string): Promise<ResultadoEcf> {
    return this.call<ResultadoEcf>('GET', `/ecf/${ecfId}/status`);
  }
}
