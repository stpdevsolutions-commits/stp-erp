import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'fs';
import { Resend } from 'resend';
import {
  PALETTE,
  buttonRow,
  dataTable,
  detailRows,
  emailLayout,
  esc,
  fallbackLink,
  highlightCard,
  money,
  note,
  p,
  plainText,
} from './email-layout';

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
    approveUrl?: string;
    rejectUrl?: string;
  }): void {
    const { clientEmail, clientName, quoteNumber, quoteTitle, total, validUntil, pdfPath, approveUrl, rejectUrl } = params;
    const attachments: { filename: string; content: Buffer }[] = [];
    if (pdfPath && existsSync(pdfPath)) {
      attachments.push({ filename: `${quoteNumber}.pdf`, content: readFileSync(pdfPath) });
    }
    const hasDecision = Boolean(approveUrl && rejectUrl);

    const decisionBlock = hasDecision
      ? `${p('Puede registrar su decisión directamente desde este correo:')}
         ${buttonRow([
           { href: approveUrl as string, label: 'Aprobar cotización', color: PALETTE.green, width: 230 },
           { href: rejectUrl as string, label: 'Rechazar', color: PALETTE.red, width: 160 },
         ])}
         ${fallbackLink(approveUrl as string, 'Si los botones no funcionan, copie y pegue este enlace para aprobar:')}`
      : '';

    const bodyHtml = `
${p(`Estimado(a) <strong>${esc(clientName)}</strong>,`)}
${p('Nos complace enviarle la siguiente cotización para su revisión. Quedamos atentos a sus comentarios.')}
${highlightCard({
  tone: 'primary',
  eyebrow: 'Cotización',
  title: esc(quoteNumber),
  subtitle: esc(quoteTitle),
})}
${detailRows([
  { label: 'Monto total (ITBIS incluido)', value: money(total), strong: true },
  ...(validUntil ? [{ label: 'Válida hasta', value: esc(validUntil) }] : []),
  ...(attachments.length ? [{ label: 'Documento adjunto', value: `${esc(quoteNumber)}.pdf` }] : []),
])}
${decisionBlock}
${note('Si prefiere solicitar ajustes a la propuesta, respóndanos por esta vía o utilice los datos de contacto que aparecen al final del correo.')}`;

    void this.send({
      to: clientEmail,
      subject: `Cotización ${quoteNumber} — ${quoteTitle}`,
      attachments,
      html: emailLayout({
        title: 'Su cotización está lista',
        preheader: `${quoteNumber} · ${quoteTitle} · ${money(total)}`,
        accentColor: PALETTE.green,
        eyebrow: 'Cotización',
        audience: 'client',
        bodyHtml,
      }),
      text: plainText([
        `Estimado(a) ${clientName},`,
        '',
        'Nos complace enviarle la siguiente cotización para su revisión.',
        '',
        `Cotización: ${quoteNumber}`,
        `Descripción: ${quoteTitle}`,
        `Monto total (ITBIS incluido): ${money(total)}`,
        ...(validUntil ? [`Válida hasta: ${validUntil}`] : []),
        ...(hasDecision
          ? ['', `Aprobar: ${approveUrl as string}`, `Rechazar: ${rejectUrl as string}`]
          : []),
      ]),
    });
  }

  // ── Quote: reminder to client (sin respuesta) ─────────────────────────────

  sendQuoteReminder(params: {
    clientEmail: string;
    clientName: string;
    quoteNumber: string;
    quoteTitle: string;
    total: number;
    validUntil?: string;
    approveUrl: string;
    rejectUrl: string;
  }): void {
    const { clientEmail, clientName, quoteNumber, quoteTitle, total, validUntil, approveUrl, rejectUrl } = params;

    const bodyHtml = `
${p(`Estimado(a) <strong>${esc(clientName)}</strong>,`)}
${p('Le recordamos cordialmente que la siguiente cotización se encuentra pendiente de su respuesta:')}
${highlightCard({
  tone: 'primary',
  eyebrow: 'Cotización pendiente',
  title: esc(quoteNumber),
  subtitle: esc(quoteTitle),
})}
${detailRows([
  { label: 'Monto total (ITBIS incluido)', value: money(total), strong: true },
  ...(validUntil ? [{ label: 'Válida hasta', value: esc(validUntil), color: PALETTE.amber }] : []),
])}
${p('Puede aprobarla o rechazarla con un solo clic:')}
${buttonRow([
  { href: approveUrl, label: 'Aprobar cotización', color: PALETTE.green, width: 230 },
  { href: rejectUrl, label: 'Rechazar', color: PALETTE.red, width: 160 },
])}
${fallbackLink(approveUrl, 'Si los botones no funcionan, copie y pegue este enlace para aprobar:')}
${note('Si necesita más tiempo o desea ajustes en la propuesta, indíquenoslo y con gusto la actualizamos.')}`;

    void this.send({
      to: clientEmail,
      subject: `Recordatorio: cotización ${quoteNumber} pendiente de su respuesta`,
      html: emailLayout({
        title: 'Cotización pendiente de su respuesta',
        preheader: `${quoteNumber} · ${quoteTitle} · ${money(total)}`,
        accentColor: PALETTE.navy,
        eyebrow: 'Recordatorio',
        audience: 'client',
        bodyHtml,
      }),
      text: plainText([
        `Estimado(a) ${clientName},`,
        '',
        'Le recordamos que la siguiente cotización está pendiente de su respuesta.',
        '',
        `Cotización: ${quoteNumber}`,
        `Descripción: ${quoteTitle}`,
        `Monto total (ITBIS incluido): ${money(total)}`,
        ...(validUntil ? [`Válida hasta: ${validUntil}`] : []),
        '',
        `Aprobar: ${approveUrl}`,
        `Rechazar: ${rejectUrl}`,
      ]),
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

    const bodyHtml = `
${p('El cliente aprobó la cotización indicada a continuación.')}
${highlightCard({
  tone: 'success',
  eyebrow: 'Cotización aprobada',
  title: esc(quoteNumber),
  subtitle: esc(quoteTitle),
  meta: `Cliente: <strong>${esc(clientName)}</strong>`,
})}
${detailRows([{ label: 'Monto aprobado', value: money(total), strong: true, color: PALETTE.green }])}
${p('Próximo paso: iniciar la planificación del proyecto, confirmar disponibilidad de materiales y coordinar el cronograma con el cliente.')}`;

    void this.send({
      to: this.adminEmail,
      subject: `Cotización ${quoteNumber} aprobada — ${clientName}`,
      html: emailLayout({
        title: 'Cotización aprobada',
        preheader: `${quoteNumber} · ${clientName} · ${money(total)}`,
        accentColor: PALETTE.green,
        eyebrow: 'STP ERP · Notificación interna',
        audience: 'internal',
        bodyHtml,
      }),
      text: plainText(
        [
          'Cotización aprobada por el cliente.',
          '',
          `Cotización: ${quoteNumber}`,
          `Descripción: ${quoteTitle}`,
          `Cliente: ${clientName}`,
          `Monto aprobado: ${money(total)}`,
          '',
          'Próximo paso: iniciar la planificación del proyecto.',
        ],
        'internal',
      ),
    });
  }

  // ── Quote: rejected (internal) ────────────────────────────────────────────

  sendQuoteRejected(params: {
    clientName: string;
    quoteNumber: string;
    quoteTitle: string;
  }): void {
    const { clientName, quoteNumber, quoteTitle } = params;

    const bodyHtml = `
${p('El cliente rechazó la cotización indicada a continuación.')}
${highlightCard({
  tone: 'danger',
  eyebrow: 'Cotización rechazada',
  title: esc(quoteNumber),
  subtitle: esc(quoteTitle),
  meta: `Cliente: <strong>${esc(clientName)}</strong>`,
})}
${p('Se recomienda contactar al cliente para conocer los motivos y evaluar si procede una propuesta ajustada.')}`;

    void this.send({
      to: this.adminEmail,
      subject: `Cotización ${quoteNumber} rechazada — ${clientName}`,
      html: emailLayout({
        title: 'Cotización rechazada',
        preheader: `${quoteNumber} · ${clientName} · requiere seguimiento`,
        accentColor: PALETTE.red,
        eyebrow: 'STP ERP · Notificación interna',
        audience: 'internal',
        bodyHtml,
      }),
      text: plainText(
        [
          'Cotización rechazada por el cliente.',
          '',
          `Cotización: ${quoteNumber}`,
          `Descripción: ${quoteTitle}`,
          `Cliente: ${clientName}`,
          '',
          'Se recomienda contactar al cliente para evaluar una propuesta ajustada.',
        ],
        'internal',
      ),
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

    const bodyHtml = `
${p(`Estimado(a) <strong>${esc(clientName)}</strong>,`)}
${p('Le informamos que la vigencia de la siguiente cotización ha concluido:')}
${highlightCard({
  tone: 'warning',
  eyebrow: 'Cotización vencida',
  title: esc(quoteNumber),
  subtitle: esc(quoteTitle),
  meta: validUntil ? `Fecha de vencimiento: ${esc(validUntil)}` : undefined,
})}
${p('Si aún está interesado en la propuesta, con gusto emitimos una cotización actualizada con los precios vigentes. Solo debe indicárnoslo.')}`;

    void this.send({
      to: clientEmail,
      subject: `Cotización ${quoteNumber} vencida — ${quoteTitle}`,
      html: emailLayout({
        title: 'Su cotización ha vencido',
        preheader: `${quoteNumber} · ${quoteTitle} · podemos emitirle una propuesta actualizada`,
        accentColor: PALETTE.amber,
        eyebrow: 'Cotización',
        audience: 'client',
        bodyHtml,
      }),
      text: plainText([
        `Estimado(a) ${clientName},`,
        '',
        'Le informamos que la vigencia de la siguiente cotización ha concluido.',
        '',
        `Cotización: ${quoteNumber}`,
        `Descripción: ${quoteTitle}`,
        ...(validUntil ? [`Fecha de vencimiento: ${validUntil}`] : []),
        '',
        'Si aún está interesado, con gusto emitimos una cotización actualizada.',
      ]),
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

    const bodyHtml = `
${p('La siguiente cotización vence en los próximos 3 días y aún no tiene respuesta del cliente.')}
${highlightCard({
  tone: 'warning',
  eyebrow: 'Por vencer',
  title: esc(quoteNumber),
  subtitle: esc(quoteTitle),
  meta: `Cliente: <strong>${esc(clientName)}</strong>`,
})}
${detailRows([
  { label: 'Monto', value: money(total), strong: true },
  ...(validUntil ? [{ label: 'Vence el', value: esc(validUntil), color: PALETTE.amber }] : []),
])}
${p('Se recomienda dar seguimiento al cliente para cerrar la cotización antes de su vencimiento.')}`;

    void this.send({
      to: this.adminEmail,
      subject: `Cotización ${quoteNumber} vence en 3 días — ${clientName}`,
      html: emailLayout({
        title: 'Cotización por vencer en 3 días',
        preheader: `${quoteNumber} · ${clientName} · ${money(total)}`,
        accentColor: PALETTE.amber,
        eyebrow: 'STP ERP · Alerta interna',
        audience: 'internal',
        bodyHtml,
      }),
      text: plainText(
        [
          'Cotización por vencer en 3 días, sin respuesta del cliente.',
          '',
          `Cotización: ${quoteNumber}`,
          `Descripción: ${quoteTitle}`,
          `Cliente: ${clientName}`,
          `Monto: ${money(total)}`,
          ...(validUntil ? [`Vence el: ${validUntil}`] : []),
        ],
        'internal',
      ),
    });
  }

  // ── Tasks: overdue summary (internal) ─────────────────────────────────────

  sendOverdueTasksSummary(params: {
    tasks: { title: string; projectName: string; assignedTo: string; dueDate: string }[];
  }): void {
    const tasks = params.tasks ?? [];

    const bodyHtml = `
${p(`Al día de hoy hay <strong>${tasks.length}</strong> tarea(s) con la fecha límite vencida.`)}
${dataTable({
  headers: [
    { label: 'Tarea' },
    { label: 'Proyecto' },
    { label: 'Asignado a' },
    { label: 'Venció', align: 'right' },
  ],
  alignments: ['left', 'left', 'left', 'right'],
  rows: tasks.map((t) => [
    `<strong style="color:${PALETTE.text}">${esc(t.title)}</strong>`,
    `<span style="color:${PALETTE.muted}">${esc(t.projectName)}</span>`,
    `<span style="color:${PALETTE.muted}">${esc(t.assignedTo)}</span>`,
    `<strong style="color:${PALETTE.red}">${esc(t.dueDate)}</strong>`,
  ]),
})}
${p('Se recomienda actualizar el estado de estas tareas o reprogramar su fecha límite en el ERP.')}`;

    void this.send({
      to: this.adminEmail,
      subject: `${tasks.length} tarea(s) vencida(s) — resumen diario STP ERP`,
      html: emailLayout({
        title: 'Tareas vencidas — resumen diario',
        preheader: `${tasks.length} tarea(s) con fecha límite vencida requieren atención`,
        accentColor: PALETTE.red,
        eyebrow: 'STP ERP · Resumen interno',
        audience: 'internal',
        maxWidth: 700,
        bodyHtml,
      }),
      text: plainText(
        [
          `Tareas vencidas: ${tasks.length}`,
          '',
          ...tasks.map((t) => `- ${t.title} · ${t.projectName} · ${t.assignedTo} · venció ${t.dueDate}`),
        ],
        'internal',
      ),
    });
  }

  // ── Auth: password reset ──────────────────────────────────────────────────

  sendPasswordReset(params: { email: string; firstName: string; resetUrl: string }): void {
    const { email, firstName, resetUrl } = params;

    const bodyHtml = `
${p(`Estimado(a) <strong>${esc(firstName)}</strong>,`)}
${p('Recibimos una solicitud para restablecer la contraseña de su cuenta en el sistema STP ERP. Para continuar, utilice el siguiente botón:')}
${buttonRow([{ href: resetUrl, label: 'Restablecer contraseña', color: PALETTE.navy, width: 250 }])}
${fallbackLink(resetUrl)}
${note('Por seguridad, este enlace expira en 1 hora y solo puede utilizarse una vez. Si usted no solicitó este cambio, ignore este correo: su contraseña actual seguirá siendo válida.')}`;

    void this.send({
      to: email,
      subject: 'Restablecimiento de contraseña — STP ERP',
      html: emailLayout({
        title: 'Restablecer su contraseña',
        preheader: 'Enlace válido por 1 hora para restablecer su contraseña del STP ERP',
        accentColor: PALETTE.navy,
        eyebrow: 'Seguridad de la cuenta',
        audience: 'client',
        bodyHtml,
      }),
      text: plainText([
        `Estimado(a) ${firstName},`,
        '',
        'Recibimos una solicitud para restablecer la contraseña de su cuenta en el STP ERP.',
        '',
        `Enlace: ${resetUrl}`,
        '',
        'El enlace expira en 1 hora. Si usted no solicitó este cambio, ignore este correo.',
      ]),
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
    const methodLabel = methodLabels[method] ?? method;

    const bodyHtml = `
${p('Se registró un nuevo pago en el sistema.')}
${highlightCard({
  tone: 'success',
  eyebrow: 'Cliente',
  title: esc(clientName),
  subtitle: esc(description),
})}
${detailRows([
  { label: 'Monto', value: money(amount), strong: true, color: PALETTE.green },
  { label: 'Método', value: esc(methodLabel) },
  { label: 'Fecha', value: esc(date) },
  ...(reference ? [{ label: 'Referencia', value: esc(reference) }] : []),
])}
${p('Verifique que el pago esté correctamente aplicado al proyecto o cotización correspondiente.')}`;

    void this.send({
      to: this.adminEmail,
      subject: `Pago registrado: ${money(amount)} — ${clientName}`,
      html: emailLayout({
        title: 'Pago registrado',
        preheader: `${clientName} · ${money(amount)} · ${methodLabel}`,
        accentColor: PALETTE.green,
        eyebrow: 'STP ERP · Notificación interna',
        audience: 'internal',
        bodyHtml,
      }),
      text: plainText(
        [
          'Nuevo pago registrado.',
          '',
          `Cliente: ${clientName}`,
          `Descripción: ${description}`,
          `Monto: ${money(amount)}`,
          `Método: ${methodLabel}`,
          `Fecha: ${date}`,
          ...(reference ? [`Referencia: ${reference}`] : []),
        ],
        'internal',
      ),
    });
  }

  // ── Payments: pending summary (weekly) ───────────────────────────────────

  sendPendingPaymentsSummary(params: {
    payments: { clientName: string; amount: number; description: string; date: string }[];
    totalAmount: number;
  }): void {
    const payments = params.payments ?? [];
    const { totalAmount } = params;

    const bodyHtml = `
${highlightCard({
  tone: 'warning',
  eyebrow: 'Total pendiente de cobro',
  title: money(totalAmount),
  subtitle: `${payments.length} pago(s) registrado(s) como pendientes`,
})}
${dataTable({
  headers: [
    { label: 'Cliente' },
    { label: 'Descripción' },
    { label: 'Fecha' },
    { label: 'Monto', align: 'right' },
  ],
  alignments: ['left', 'left', 'left', 'right'],
  rows: payments.map((pay) => [
    `<strong style="color:${PALETTE.text}">${esc(pay.clientName)}</strong>`,
    `<span style="color:${PALETTE.muted}">${esc(pay.description)}</span>`,
    `<span style="color:${PALETTE.muted}">${esc(pay.date)}</span>`,
    `<strong style="color:${PALETTE.amber}">${money(pay.amount)}</strong>`,
  ]),
})}
${p('Se recomienda dar seguimiento a estos cobros con los clientes correspondientes.')}`;

    void this.send({
      to: this.adminEmail,
      subject: `${payments.length} pago(s) pendiente(s) por ${money(totalAmount)} — resumen semanal STP ERP`,
      html: emailLayout({
        title: 'Pagos pendientes — resumen semanal',
        preheader: `${payments.length} pago(s) pendiente(s) por un total de ${money(totalAmount)}`,
        accentColor: PALETTE.amber,
        eyebrow: 'STP ERP · Resumen interno',
        audience: 'internal',
        maxWidth: 700,
        bodyHtml,
      }),
      text: plainText(
        [
          `Pagos pendientes: ${payments.length} · Total ${money(totalAmount)}`,
          '',
          ...payments.map((pay) => `- ${pay.clientName} · ${pay.description} · ${pay.date} · ${money(pay.amount)}`),
        ],
        'internal',
      ),
    });
  }

  // ── Internal sender ────────────────────────────────────────────────────────

  private async send(options: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    attachments?: { filename: string; content: Buffer }[];
  }): Promise<void> {
    if (!this.resend) return;
    try {
      await this.resend.emails.send({
        from: this.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        ...(options.text ? { text: options.text } : {}),
        ...(options.attachments?.length ? { attachments: options.attachments } : {}),
      });
      this.logger.log(`Email sent to ${options.to}: ${options.subject}`);
    } catch (err) {
      this.logger.error(`Failed to send email to ${options.to}: ${(err as Error).message}`);
    }
  }
}
