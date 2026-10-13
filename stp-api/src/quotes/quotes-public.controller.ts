import { Body, Controller, Get, Post, Query, Header, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { QuotesService, QuoteDecisionResult } from './quotes.service';
import { QuoteStatus } from './entities/quote.entity';

/**
 * Controlador PÚBLICO (sin JwtAuthGuard) para la decisión del cliente sobre una
 * cotización (aprobar/rechazar) desde el enlace del correo.
 *
 * Se registra ANTES que QuotesController en el módulo para que la ruta estática
 * `GET /quotes/decision` gane a `GET /quotes/:id` en la resolución de rutas.
 * Throttle estricto: 10 peticiones/min por IP.
 */
@Controller('quotes')
export class QuotesPublicController {
  constructor(private readonly quotesService: QuotesService) {}

  /**
   * Enlace del correo: solo MUESTRA la confirmación. Cambiar el estado con un GET dejaba que los escáneres de
   * enlaces aprobaran o rechazaran la cotización sin que el cliente hiciera nada (abren los dos enlaces).
   */
  @Get('decision')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Content-Security-Policy', "frame-ancestors 'none'; form-action 'self'")
  @Header('Cache-Control', 'no-store')
  async preview(@Query('token') token: string, @Query('action') action: string): Promise<string> {
    return renderDecisionPage(await this.quotesService.previewDecision(token ?? '', action ?? ''));
  }

  /** Botón "Confirmar" de la página anterior: aquí sí se decide. */
  @Post('decision')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Content-Security-Policy', "frame-ancestors 'none'")
  @Header('Cache-Control', 'no-store')
  async decision(
    @Body('token') token: string,
    @Body('action') action: string,
    @Req() req: Request,
  ): Promise<string> {
    // Detrás de Caddy: la IP real del cliente llega en X-Forwarded-For.
    const forwarded = (req.headers['x-forwarded-for'] as string | undefined)
      ?.split(',')[0]
      ?.trim();
    const result = await this.quotesService.decide(String(token ?? ''), String(action ?? ''), {
      ip: forwarded || req.ip,
      userAgent: req.headers['user-agent'],
    });
    return renderDecisionPage(result);
  }
}

// ── HTML rendering (branding STP) ────────────────────────────────────────────

const NAVY = '#0D3773';

function page(opts: {
  emoji: string;
  color: string;
  heading: string;
  body: string;
}): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cotización — Soluciones Técnicas Profesionales</title>
</head>
<body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#f5f7fa">
  <div style="max-width:520px;margin:0 auto;padding:48px 16px">
    <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">
      <div style="background:${NAVY};padding:28px 32px;text-align:center">
        <div style="color:#fff;font-size:26px;font-weight:800;letter-spacing:3px">STP</div>
        <div style="color:#a8c4e0;font-size:12px;margin-top:4px">Soluciones Técnicas Profesionales</div>
      </div>
      <div style="padding:40px 32px;text-align:center">
        <div style="font-size:54px;line-height:1">${opts.emoji}</div>
        <h1 style="color:${opts.color};font-size:24px;margin:18px 0 10px">${opts.heading}</h1>
        <div style="color:#374151;font-size:15px;line-height:1.6">${opts.body}</div>
      </div>
      <div style="background:#f9fafb;padding:18px 32px;border-top:1px solid #e5e7eb">
        <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center">Soluciones Técnicas Profesionales · República Dominicana</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

const esc = (v: string): string =>
  v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

function renderDecisionPage(result: QuoteDecisionResult): string {
  switch (result.kind) {
    case 'confirm': {
      const approve = result.action === 'approve';
      const btn = approve ? '#157B52' : '#b91c1c';
      return page({
        emoji: approve ? '✅' : '🚫',
        color: btn,
        heading: approve ? 'Confirmar aprobación' : 'Confirmar rechazo',
        body: `¿Desea ${approve ? 'aprobar' : 'rechazar'} la cotización <strong>${esc(result.quoteNumber)}</strong>?<br><br>
<form method="POST" action="decision" style="margin:0">
  <input type="hidden" name="token" value="${esc(result.token)}" />
  <input type="hidden" name="action" value="${result.action}" />
  <button type="submit" style="background:${btn};color:#fff;border:0;border-radius:8px;padding:12px 28px;font-size:16px;font-weight:700;cursor:pointer">${approve ? 'Sí, aprobar' : 'Sí, rechazar'}</button>
</form>`,
      });
    }

    case 'success':
      return result.status === QuoteStatus.APPROVED
        ? page({
            emoji: '✅',
            color: '#157B52',
            heading: 'Cotización aprobada',
            body: `Ha aprobado la cotización <strong>${result.quoteNumber}</strong>.<br>Gracias, nos pondremos en contacto a la brevedad.`,
          })
        : page({
            emoji: '🚫',
            color: '#b91c1c',
            heading: 'Cotización rechazada',
            body: `Ha rechazado la cotización <strong>${result.quoteNumber}</strong>.<br>Gracias por su respuesta, nos pondremos en contacto.`,
          });

    case 'already':
      return page({
        emoji: 'ℹ️',
        color: NAVY,
        heading: 'Cotización ya procesada',
        body: `Esta cotización <strong>${result.quoteNumber}</strong> ya fue ${
          result.status === QuoteStatus.APPROVED ? 'aprobada' : 'rechazada'
        } anteriormente. No se realizó ningún cambio.`,
      });

    case 'not-sent':
      return page({
        emoji: '⚠️',
        color: '#b45309',
        heading: 'No disponible',
        body: `La cotización <strong>${result.quoteNumber}</strong> no está disponible para aprobar o rechazar en este momento. Por favor, contáctenos para más información.`,
      });

    case 'invalid':
    default:
      return page({
        emoji: '⚠️',
        color: '#b45309',
        heading: 'Enlace no válido',
        body: 'Este enlace no es válido o ha expirado. Por favor, contáctenos para recibir una nueva cotización.',
      });
  }
}
