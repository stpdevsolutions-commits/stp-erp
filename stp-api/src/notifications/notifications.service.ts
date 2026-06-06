import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly resend: Resend;
  private readonly from: string;
  private readonly adminEmail: string;

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(config.get<string>('RESEND_API_KEY'));
    this.from = config.get<string>('RESEND_FROM_EMAIL') ?? 'noreply@stpsoluciones.com';
    this.adminEmail = config.get<string>('ADMIN_EMAIL') ?? 'admin@stpsoluciones.com';
  }

  // ── Quote: sent to client ──────────────────────────────────────────────────

  sendQuoteSent(params: {
    clientEmail: string;
    clientName: string;
    quoteNumber: string;
    quoteTitle: string;
    total: number;
    validUntil?: string;
  }): void {
    const { clientEmail, clientName, quoteNumber, quoteTitle, total, validUntil } = params;
    void this.send({
      to: clientEmail,
      subject: `Cotización ${quoteNumber} — ${quoteTitle}`,
      html: `
        <div style="font-family:Arial,sans-serif;background:#f5f7fa;padding:32px 16px">
          <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
            <div style="background:#1a3c6e;padding:28px 32px">
              <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:.5px">Soluciones Técnicas Profesionales</h1>
              <p style="color:#a8c4e0;margin:4px 0 0;font-size:13px">stpsoluciones.com</p>
            </div>
            <div style="padding:32px">
              <p style="color:#374151;font-size:15px">Estimado(a) <strong>${clientName}</strong>,</p>
              <p style="color:#374151;font-size:15px">Nos complace enviarle la siguiente cotización para su revisión:</p>

              <div style="background:#f0f4ff;border-left:4px solid #1a3c6e;border-radius:4px;padding:20px 24px;margin:24px 0">
                <p style="margin:0 0 8px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.5px">Cotización</p>
                <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#1a3c6e">${quoteNumber}</p>
                <p style="margin:0;color:#374151;font-size:15px">${quoteTitle}</p>
              </div>

              <table style="width:100%;border-collapse:collapse;margin:24px 0">
                <tr>
                  <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:14px">Monto total (ITBIS incluido)</td>
                  <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-size:18px;font-weight:700;color:#1a3c6e">RD$ ${total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
                </tr>
                ${validUntil ? `<tr><td style="padding:12px 0;color:#6b7280;font-size:14px">Válida hasta</td><td style="padding:12px 0;text-align:right;color:#374151;font-size:14px">${validUntil}</td></tr>` : ''}
              </table>

              <p style="color:#374151;font-size:14px">Para aprobar esta cotización o solicitar ajustes, contáctenos respondiendo este correo o al número de teléfono de su ejecutivo de cuenta.</p>
            </div>
            <div style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center">Soluciones Técnicas Profesionales · República Dominicana</p>
            </div>
          </div>
        </div>
      `,
    });
  }

  // ── Quote: approved (internal) ─────────────────────────────────────────────

  sendQuoteApproved(params: {
    quoteNumber: string;
    quoteTitle: string;
    clientName: string;
    total: number;
  }): void {
    const { quoteNumber, quoteTitle, clientName, total } = params;
    void this.send({
      to: this.adminEmail,
      subject: `✅ Cotización aprobada: ${quoteNumber} — ${clientName}`,
      html: `
        <div style="font-family:Arial,sans-serif;background:#f5f7fa;padding:32px 16px">
          <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
            <div style="background:#166534;padding:28px 32px">
              <h1 style="color:#fff;margin:0;font-size:20px">✅ Cotización Aprobada</h1>
              <p style="color:#bbf7d0;margin:4px 0 0;font-size:13px">STP ERP — Notificación interna</p>
            </div>
            <div style="padding:32px">
              <div style="background:#f0fdf4;border-left:4px solid #166534;border-radius:4px;padding:20px 24px;margin-bottom:24px">
                <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#166534">${quoteNumber}</p>
                <p style="margin:0 0 4px;color:#374151">${quoteTitle}</p>
                <p style="margin:0;color:#6b7280;font-size:14px">Cliente: <strong>${clientName}</strong></p>
              </div>
              <table style="width:100%;border-collapse:collapse">
                <tr>
                  <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:14px">Monto aprobado</td>
                  <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-size:18px;font-weight:700;color:#166534">RD$ ${total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
                </tr>
              </table>
              <p style="color:#374151;font-size:14px;margin-top:24px">El cliente ha aprobado la cotización. Proceder con la planificación del proyecto.</p>
            </div>
          </div>
        </div>
      `,
    });
  }

  // ── Payment: received (internal) ──────────────────────────────────────────

  sendPaymentReceived(params: {
    clientName: string;
    amount: number;
    description: string;
    method: string;
    reference?: string;
    date: string;
  }): void {
    const { clientName, amount, description, method, reference, date } = params;
    const methodLabels: Record<string, string> = {
      cash: 'Efectivo', transfer: 'Transferencia', check: 'Cheque', card: 'Tarjeta', other: 'Otro',
    };
    void this.send({
      to: this.adminEmail,
      subject: `💰 Pago registrado — ${clientName} — RD$ ${amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`,
      html: `
        <div style="font-family:Arial,sans-serif;background:#f5f7fa;padding:32px 16px">
          <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
            <div style="background:#1a3c6e;padding:28px 32px">
              <h1 style="color:#fff;margin:0;font-size:20px">💰 Pago Registrado</h1>
              <p style="color:#a8c4e0;margin:4px 0 0;font-size:13px">STP ERP — Notificación interna</p>
            </div>
            <div style="padding:32px">
              <div style="background:#f0f4ff;border-left:4px solid #1a3c6e;border-radius:4px;padding:20px 24px;margin-bottom:24px">
                <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase">Cliente</p>
                <p style="margin:0;font-size:18px;font-weight:700;color:#1a3c6e">${clientName}</p>
              </div>
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:14px">Monto</td><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-size:18px;font-weight:700;color:#1a3c6e">RD$ ${amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td></tr>
                <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:14px">Descripción</td><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;color:#374151;font-size:14px">${description}</td></tr>
                <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:14px">Método</td><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;color:#374151;font-size:14px">${methodLabels[method] ?? method}</td></tr>
                <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:14px">Fecha</td><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;color:#374151;font-size:14px">${date}</td></tr>
                ${reference ? `<tr><td style="padding:10px 0;color:#6b7280;font-size:14px">Referencia</td><td style="padding:10px 0;text-align:right;color:#374151;font-size:14px">${reference}</td></tr>` : ''}
              </table>
            </div>
          </div>
        </div>
      `,
    });
  }

  // ── Internal sender ────────────────────────────────────────────────────────

  private async send(options: { to: string; subject: string; html: string }): Promise<void> {
    try {
      await this.resend.emails.send({
        from: this.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
      this.logger.log(`Email sent to ${options.to}: ${options.subject}`);
    } catch (err) {
      this.logger.error(`Failed to send email to ${options.to}: ${(err as Error).message}`);
    }
  }
}
