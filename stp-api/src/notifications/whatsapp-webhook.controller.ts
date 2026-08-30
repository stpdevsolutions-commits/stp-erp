import { Controller, Get, Post, Query, Body, Res, Logger, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

/**
 * Webhook público de WhatsApp Cloud API (Meta). Expuesto SOLO en
 * gw.stpsoluciones.com/whatsapp/webhook (ver Caddyfile) — la misma pasarela
 * pública sin VPN que ya se usa para el botón de decisión de cotizaciones,
 * porque los servidores de Meta necesitan llegar aquí desde internet.
 *
 * Por ahora solo loguea lo que llega — sirve para ver el motivo real de un
 * fallo de entrega (estados de mensaje: sent/delivered/read/failed) mientras
 * se depura el envío por API oficial. Más adelante, si hace falta, aquí se
 * procesarían respuestas entrantes de colaboradores.
 */
@Controller('whatsapp/webhook')
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(private readonly config: ConfigService) {}

  /** Verificación inicial que hace Meta al configurar la URL del webhook. */
  @Get()
  verify(@Query() query: Record<string, string>, @Res() res: Response) {
    const expected = this.config.get<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && expected && token === expected) {
      this.logger.log('Webhook verificado por Meta');
      res.status(HttpStatus.OK).send(challenge);
      return;
    }
    this.logger.warn(`Verificación de webhook rechazada (token="${token}")`);
    res.status(HttpStatus.FORBIDDEN).send('Forbidden');
  }

  /** Eventos reales: estados de mensaje, mensajes entrantes, etc. */
  @Post()
  receive(@Body() body: unknown) {
    this.logger.log(`Webhook de WhatsApp recibido: ${JSON.stringify(body)}`);
    return { received: true };
  }
}
