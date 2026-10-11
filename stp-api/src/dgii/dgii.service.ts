import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  ComprobanteResult,
  RncInfo,
  RncSearchRow,
  TimbreInfo,
  parseComprobantePage,
  parseRncPage,
  parseRncSearch,
  parseTimbrePage,
} from './dgii-html';
import { isDgiiUrl } from '../fiscal-invoices/qr-ecf';

const BASE = 'https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas';
const RNC_URL = `${BASE}/rnc.aspx`;
const NCF_URL = `${BASE}/ncf.aspx`;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

interface AspxSession {
  viewState: string;
  eventValidation: string;
  viewStateGenerator: string;
  cookie: string;
}

const hidden = (html: string, name: string): string =>
  html.match(new RegExp(`id=["']${name}["'][^>]*value=["']([^"']*)["']`, 'i'))?.[1] ?? '';

/**
 * Consultas al portal público de la DGII (RNC y comprobantes). El portal es ASP.NET
 * WebForms: se abre la página para obtener el estado del formulario y se simula el
 * postback. Sin clave ni cuenta; es la misma consulta que hace cualquiera en su sitio.
 *
 * Cualquier fallo de red o de formato se convierte en un 503 con un mensaje que el
 * usuario puede entender: la DGII se cae seguido y eso no debe tumbar nada del ERP.
 */
@Injectable()
export class DgiiService {
  private readonly logger = new Logger(DgiiService.name);

  async lookupRnc(rnc: string): Promise<RncInfo> {
    const html = await this.submit(
      RNC_URL,
      'ctl00$cphMain$upBusqueda|ctl00$cphMain$btnBuscarPorRNC',
      { 'ctl00$cphMain$txtRNCCedula': rnc, 'ctl00$cphMain$txtRazonSocial': '' },
      ['ctl00$cphMain$btnBuscarPorRNC', 'BUSCAR'],
    );
    return parseRncPage(html, rnc);
  }

  async searchByName(name: string): Promise<RncSearchRow[]> {
    const html = await this.submit(
      RNC_URL,
      'ctl00$cphMain$upBusqueda|ctl00$cphMain$btnBuscarPorRazonSocial',
      { 'ctl00$cphMain$txtRNCCedula': '', 'ctl00$cphMain$txtRazonSocial': name },
      ['ctl00$cphMain$btnBuscarPorRazonSocial', 'BUSCAR'],
    );
    return parseRncSearch(html);
  }

  /**
   * Consulta un NCF (papel) o e-NCF. Un e-CF solo se resuelve con el RNC del comprador
   * y el código de seguridad del comprobante; sin ellos la DGII responde "falta un dato".
   */
  async checkComprobante(input: {
    rnc: string;
    ncf: string;
    rncComprador?: string;
    codigoSeguridad?: string;
  }): Promise<ComprobanteResult> {
    const html = await this.submit(
      NCF_URL,
      'ctl00$upMainMaster|ctl00$cphMain$btnConsultar',
      {
        'ctl00$cphMain$txtRNC': input.rnc,
        'ctl00$cphMain$txtNCF': input.ncf,
        'ctl00$cphMain$txtRncComprador': input.rncComprador ?? '',
        'ctl00$cphMain$txtCodigoSeg': input.codigoSeguridad ?? '',
      },
      ['ctl00$cphMain$btnConsultar', 'Buscar'],
    );
    const result = parseComprobantePage(html, input.ncf.startsWith('E'));
    if (result.verdict === 'unknown') {
      // Señal de que la DGII cambió su página: se ve en los logs, no se le inventa nada al usuario.
      this.logger.warn(`Respuesta de la DGII no reconocida para ${input.rnc}/${input.ncf}`);
    }
    return result;
  }

  /**
   * Abre la página de consulta del timbre de un e-CF (la dirección del QR) y la lee. Solo
   * va a dgii.gov.do: una redirección a otro sitio se corta, y cualquier fallo devuelve null
   * (el QR igual sirve; solo faltarían los datos que la DGII agrega).
   */
  async fetchTimbre(url: string): Promise<TimbreInfo | null> {
    let target = url;
    try {
      for (let hop = 0; hop < 3; hop++) {
        if (!isDgiiUrl(target)) return null;
        const res = await fetch(target, {
          headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'es-DO,es;q=0.9' },
          redirect: 'manual',
          signal: AbortSignal.timeout(12_000),
        });
        if (res.status >= 300 && res.status < 400) {
          const next = res.headers.get('location');
          if (!next) return null;
          target = new URL(next, target).toString();
          continue;
        }
        if (!res.ok) return null;
        return parseTimbrePage(await res.text());
      }
      return null;
    } catch (err) {
      this.logger.warn(`No se pudo consultar el timbre del e-CF: ${(err as Error).message}`);
      return null;
    }
  }

  // ── Mecánica del postback ────────────────────────────────────────────────

  private async openSession(url: string): Promise<AspxSession> {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'es-DO,es;q=0.9' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`DGII respondió HTTP ${res.status}`);
    const html = await res.text();
    const viewState = hidden(html, '__VIEWSTATE');
    if (!viewState) throw new Error('La página de la DGII no trae el estado del formulario');
    return {
      viewState,
      eventValidation: hidden(html, '__EVENTVALIDATION'),
      viewStateGenerator: hidden(html, '__VIEWSTATEGENERATOR'),
      cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; '),
    };
  }

  private async submit(
    url: string,
    asyncTarget: string,
    fields: Record<string, string>,
    [submitField, submitValue]: [string, string],
  ): Promise<string> {
    try {
      const session = await this.openSession(url);
      const body = new URLSearchParams({
        'ctl00$smMain': asyncTarget,
        ...fields,
        __EVENTTARGET: '',
        __EVENTARGUMENT: '',
        __VIEWSTATEGENERATOR: session.viewStateGenerator,
        __VIEWSTATE: session.viewState,
        __EVENTVALIDATION: session.eventValidation,
        __ASYNCPOST: 'true',
        [submitField]: submitValue,
      });
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          Accept: '*/*',
          'Accept-Language': 'es-DO,es;q=0.9',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Origin: 'https://dgii.gov.do',
          Referer: url,
          'Cache-Control': 'no-cache',
          ...(session.cookie ? { Cookie: session.cookie } : {}),
        },
        body: body.toString(),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`DGII respondió HTTP ${res.status}`);
      const raw = await res.text();
      // La respuesta AJAX de ASP.NET viene envuelta (largo|tipo|id|contenido|…): se
      // queda solo lo que va del primer '<' al último '>'.
      const start = raw.indexOf('<');
      const end = raw.lastIndexOf('>');
      return start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
    } catch (err) {
      this.logger.error(`Consulta a la DGII falló: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'No se pudo consultar la DGII en este momento. Inténtalo de nuevo en unos minutos.',
      );
    }
  }
}
