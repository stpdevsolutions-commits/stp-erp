import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'fs';
import { Resend } from 'resend';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly resend: Resend | undefined;
  private readonly from: string;
  private readonly adminEmail: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = config.get<string>('RESEND_API_KEY');
    if (apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      this.logger.warn('RESEND_API_KEY not set — email notifications disabled');
    }
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
    pdfPath?: string;
  }): void {
    const { clientEmail, clientName, quoteNumber, quoteTitle, total, validUntil, pdfPath } = params;
    const attachments: { filename: string; content: Buffer }[] = [];
    if (pdfPath && existsSync(pdfPath)) {
      attachments.push({ filename: `${quoteNumber}.pdf`, content: readFileSync(pdfPath) });
    }
    void this.send({
      to: clientEmail,
      subject: `Cotización ${quoteNumber} — ${quoteTitle}`,
      attachments,
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

  // ── Quote: rejected (internal) ────────────────────────────────────────────

  sendQuoteRejected(params: {
    clientName: string;
    quoteNumber: string;
    quoteTitle: string;
  }): void {
    const { clientName, quoteNumber, quoteTitle } = params;
    void this.send({
      to: this.adminEmail,
      subject: `❌ Cotización rechazada: ${quoteNumber} — ${clientName}`,
      html: `
        <div style="font-family:Arial,sans-serif;background:#f5f7fa;padding:32px 16px">
          <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
            <div style="background:#7f1d1d;padding:28px 32px">
              <h1 style="color:#fff;margin:0;font-size:20px">❌ Cotización Rechazada</h1>
              <p style="color:#fca5a5;margin:4px 0 0;font-size:13px">STP ERP — Notificación interna</p>
            </div>
            <div style="padding:32px">
              <div style="background:#fef2f2;border-left:4px solid #7f1d1d;border-radius:4px;padding:20px 24px;margin-bottom:24px">
                <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#7f1d1d">${quoteNumber}</p>
                <p style="margin:0 0 4px;color:#374151">${quoteTitle}</p>
                <p style="margin:0;color:#6b7280;font-size:14px">Cliente: <strong>${clientName}</strong></p>
              </div>
              <p style="color:#374151;font-size:14px">El cliente ha rechazado la cotización. Considere contactarlo para discutir ajustes o emitir una nueva propuesta.</p>
            </div>
          </div>
        </div>
      `,
    });
  }

  // ── Quote: expired (to client) ─────────────────────────────────────────────

  sendQuoteExpired(params: {
    clientEmail: string;
    clientName: string;
    quoteNumber: string;
    quoteTitle: string;
    validUntil?: string;
  }): void {
    const { clientEmail, clientName, quoteNumber, quoteTitle, validUntil } = params;
    void this.send({
      to: clientEmail,
      subject: `Cotización ${quoteNumber} vencida`,
      html: `
        <div style="font-family:Arial,sans-serif;background:#f5f7fa;padding:32px 16px">
          <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
            <div style="background:#78350f;padding:28px 32px">
              <h1 style="color:#fff;margin:0;font-size:20px">Cotización Vencida</h1>
              <p style="color:#fcd34d;margin:4px 0 0;font-size:13px">Soluciones Técnicas Profesionales</p>
            </div>
            <div style="padding:32px">
              <p style="color:#374151;font-size:15px">Estimado(a) <strong>${clientName}</strong>,</p>
              <p style="color:#374151;font-size:15px">Le informamos que la siguiente cotización ha vencido:</p>
              <div style="background:#fffbeb;border-left:4px solid #78350f;border-radius:4px;padding:20px 24px;margin:24px 0">
                <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#78350f">${quoteNumber}</p>
                <p style="margin:0 0 8px;color:#374151">${quoteTitle}</p>
                ${validUntil ? `<p style="margin:0;color:#6b7280;font-size:13px">Fecha de vencimiento: ${validUntil}</p>` : ''}
              </div>
              <p style="color:#374151;font-size:14px">Si está interesado en retomar la propuesta, contáctenos para emitir una nueva cotización actualizada.</p>
            </div>
            <div style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center">Soluciones Técnicas Profesionales · República Dominicana</p>
            </div>
          </div>
        </div>
      `,
    });
  }

  // ── Quote: expiring soon (internal alert) ─────────────────────────────────

  sendQuoteExpiringSoon(params: {
    quoteNumber: string;
    quoteTitle: string;
    clientName: string;
    validUntil?: string;
    total: number;
  }): void {
    const { quoteNumber, quoteTitle, clientName, validUntil, total } = params;
    void this.send({
      to: this.adminEmail,
      subject: `⚠️ Cotización por vencer: ${quoteNumber} — ${clientName}`,
      html: `
        <div style="font-family:Arial,sans-serif;background:#f5f7fa;padding:32px 16px">
          <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
            <div style="background:#78350f;padding:28px 32px">
              <h1 style="color:#fff;margin:0;font-size:20px">⚠️ Cotización por vencer en 3 días</h1>
            </div>
            <div style="padding:32px">
              <div style="background:#fffbeb;border-left:4px solid #78350f;border-radius:4px;padding:20px 24px;margin-bottom:24px">
                <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#78350f">${quoteNumber}</p>
                <p style="margin:0 0 4px;color:#374151">${quoteTitle}</p>
                <p style="margin:0;color:#6b7280;font-size:14px">Cliente: <strong>${clientName}</strong></p>
              </div>
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:14px">Monto</td><td style="padding:10px 0;text-align:right;font-weight:700;color:#1a3c6e">RD$ ${total.toLocaleString('es-DO',{minimumFractionDigits:2})}</td></tr>
                ${validUntil ? `<tr><td style="padding:10px 0;color:#6b7280;font-size:14px">Vence el</td><td style="padding:10px 0;text-align:right;font-weight:600;color:#dc2626">${validUntil}</td></tr>` : ''}
              </table>
              <p style="color:#374151;font-size:14px;margin-top:24px">Considera hacer seguimiento al cliente para cerrar esta cotización antes de que expire.</p>
            </div>
          </div>
        </div>`,
    });
  }

  // ── Tasks: overdue summary (internal) ─────────────────────────────────────

  sendOverdueTasksSummary(params: {
    tasks: { title: string; projectName: string; assignedTo: string; dueDate: string }[];
  }): void {
    const { tasks } = params;
    const rows = tasks.map((t) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151">${t.title}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280">${t.projectName}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280">${t.assignedTo}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#dc2626;font-weight:600">${t.dueDate}</td>
      </tr>`).join('');
    void this.send({
      to: this.adminEmail,
      subject: `🔴 ${tasks.length} tarea(s) vencida(s) — STP ERP`,
      html: `
        <div style="font-family:Arial,sans-serif;background:#f5f7fa;padding:32px 16px">
          <div style="max-width:700px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
            <div style="background:#7f1d1d;padding:28px 32px">
              <h1 style="color:#fff;margin:0;font-size:20px">🔴 Tareas Vencidas — Resumen diario</h1>
            </div>
            <div style="padding:32px">
              <p style="color:#374151;font-size:15px;margin-bottom:20px">Hay <strong>${tasks.length}</strong> tarea(s) con fecha límite vencida:</p>
              <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">
                <thead><tr style="background:#f9fafb">
                  <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280">Tarea</th>
                  <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280">Proyecto</th>
                  <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280">Asignado a</th>
                  <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280">Venció</th>
                </tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>
        </div>`,
    });
  }

  // ── Auth: password reset ──────────────────────────────────────────────────

  sendPasswordReset(params: { email: string; firstName: string; resetUrl: string }): void {
    const { email, firstName, resetUrl } = params;
    void this.send({
      to: email,
      subject: 'Restablecer contraseña — STP',
      html: `
        <div style="font-family:Arial,sans-serif;background:#f5f7fa;padding:32px 16px">
          <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
            <div style="background:#1a3c6e;padding:28px 32px">
              <h1 style="color:#fff;margin:0;font-size:20px">Restablecer contraseña</h1>
              <p style="color:#a8c4e0;margin:4px 0 0;font-size:13px">Soluciones Técnicas Profesionales</p>
            </div>
            <div style="padding:32px">
              <p style="color:#374151;font-size:15px">Hola <strong>${firstName}</strong>,</p>
              <p style="color:#374151;font-size:15px">Recibimos una solicitud para restablecer la contraseña de tu cuenta. Haz clic en el botón para continuar:</p>
              <div style="text-align:center;margin:32px 0">
                <a href="${resetUrl}" style="background:#1a3c6e;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:15px;font-weight:700;display:inline-block">Restablecer contraseña</a>
              </div>
              <p style="color:#6b7280;font-size:13px">Este enlace expira en 1 hora. Si no solicitaste restablecer tu contraseña, ignora este correo.</p>
              <p style="color:#9ca3af;font-size:12px;word-break:break-all">O copia este enlace en tu navegador:<br>${resetUrl}</p>
            </div>
            <div style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center">Soluciones Técnicas Profesionales · República Dominicana</p>
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

  private async send(options: {
    to: string;
    subject: string;
    html: string;
    attachments?: { filename: string; content: Buffer }[];
  }): Promise<void> {
    if (!this.resend) return;
    try {
      await this.resend.emails.send({
        from: this.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        ...(options.attachments?.length ? { attachments: options.attachments } : {}),
      });
      this.logger.log(`Email sent to ${options.to}: ${options.subject}`);
    } catch (err) {
      this.logger.error(`Failed to send email to ${options.to}: ${(err as Error).message}`);
    }
  }
}
