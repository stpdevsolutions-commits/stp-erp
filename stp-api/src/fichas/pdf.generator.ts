import { Ficha, FichaType } from './entities/ficha.entity';
import { FichaElectricaData } from './types/ficha-electrica.types';

function escHtml(s: string | undefined | null): string {
  if (!s) return '—';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function row(label: string, value: string | number | undefined | null): string {
  return `<tr><td class="lbl">${escHtml(label)}</td><td>${escHtml(String(value ?? '—'))}</td></tr>`;
}

function section(title: string, content: string): string {
  return `<div class="section"><h3>${escHtml(title)}</h3>${content}</div>`;
}

function electricaHtml(d: FichaElectricaData): string {
  const tipo = { instalacion_nueva: 'Instalación nueva', remodelacion: 'Remodelación', mantenimiento: 'Mantenimiento', diagnostico: 'Diagnóstico' };
  const fases = { monofasico: 'Monofásico', bifasico: 'Bifásico', trifasico: 'Trifásico' };

  let html = section('Información general', `<table>
    ${row('Tipo de trabajo', tipo[d.tipoTrabajo])}
    ${row('Voltaje de servicio', d.voltajeServicio)}
    ${row('Fases', fases[d.fases])}
  </table>`);

  if (d.tableros?.length) {
    const items = d.tableros.map((t) => `
      <div class="item">
        <strong>${escHtml(t.nombre) || 'Sin nombre'}</strong>
        <table>${row('Tipo', t.tipo)}${row('Amperaje', `${t.amperaje}A`)}${row('Estado', t.estado)}${t.observaciones ? row('Obs.', t.observaciones) : ''}</table>
      </div>`).join('');
    html += section(`Tableros (${d.tableros.length})`, items);
  }

  if (d.circuitos?.length) {
    const items = d.circuitos.map((c) => `
      <div class="item">
        <strong>#${escHtml(c.numero)} — ${escHtml(c.descripcion)}</strong>
        <table>${row('Breaker', `${c.breakerA}A`)}${row('Calibre', `AWG #${c.calibreAWG}`)}${row('Tipo', c.tipo)}${row('Estado', c.estado)}</table>
      </div>`).join('');
    html += section(`Circuitos (${d.circuitos.length})`, items);
  }

  if (d.materiales?.length) {
    const rows = d.materiales.map((m) => `<tr><td>${escHtml(m.descripcion)}</td><td>${m.cantidad} ${m.unidad}</td></tr>`).join('');
    html += section(`Materiales (${d.materiales.length})`, `<table><thead><tr><th>Descripción</th><th>Cantidad</th></tr></thead><tbody>${rows}</tbody></table>`);
  }

  if (d.observacionesGenerales) html += section('Observaciones generales', `<p>${escHtml(d.observacionesGenerales)}</p>`);
  if (d.recomendaciones) html += section('Recomendaciones', `<p>${escHtml(d.recomendaciones)}</p>`);

  return html;
}

export function generateFichaPdfHtml(ficha: Ficha): string {
  const typeLabel: Record<FichaType, string> = {
    electrico: 'Eléctrica',
    civil: 'Civil',
    electromecanico: 'Electromecánica',
    levantamiento: 'Levantamiento general',
    evaluacion_danos: 'Evaluación de daños',
  };

  const statusLabel: Record<string, string> = { borrador: 'Borrador', en_progreso: 'En progreso', enviada: 'Enviada' };

  const projectName = (ficha.project as unknown as { name?: string })?.name ?? '—';
  const techName = ficha.technician
    ? `${(ficha.technician as unknown as { firstName?: string }).firstName ?? ''} ${(ficha.technician as unknown as { lastName?: string }).lastName ?? ''}`.trim()
    : '—';

  let bodyContent = '';
  if (ficha.type === FichaType.ELECTRICO) {
    bodyContent = electricaHtml(ficha.data as unknown as FichaElectricaData);
  } else {
    bodyContent = `<pre style="font-size:12px;white-space:pre-wrap;">${JSON.stringify(ficha.data, null, 2)}</pre>`;
  }

  const signatureSection = ficha.signature
    ? `${section('Firma del técnico', `<div class="sig-container"><svg width="300" height="120" xmlns="http://www.w3.org/2000/svg">${(ficha.signature as string).split('|').map((d) => `<path d="${d}" stroke="#1565C0" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</svg></div>`)}`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Ficha ${ficha.code}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #222; padding: 24px; }
  .header { background: #1565C0; color: #fff; padding: 20px 24px; border-radius: 8px; margin-bottom: 20px; }
  .header h1 { font-size: 22px; margin-bottom: 4px; }
  .header p { font-size: 13px; opacity: 0.85; margin-top: 2px; }
  .badge { display: inline-block; background: rgba(255,255,255,0.25); border-radius: 4px; padding: 2px 10px; font-size: 11px; font-weight: 700; margin-top: 8px; }
  .section { background: #fff; border: 1px solid #E3F2FD; border-radius: 8px; padding: 16px; margin-bottom: 14px; }
  .section h3 { font-size: 14px; color: #1565C0; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #E3F2FD; }
  table { width: 100%; border-collapse: collapse; }
  thead tr { background: #E3F2FD; }
  th, td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #F5F5F5; font-size: 12px; }
  td.lbl { color: #666; width: 40%; font-weight: 600; }
  .item { margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px dashed #EEE; }
  .item:last-child { border-bottom: none; margin-bottom: 0; }
  p { line-height: 1.6; }
  .sig-container { border: 1px solid #DDD; border-radius: 6px; padding: 8px; display: inline-block; margin-top: 4px; }
  .footer { text-align: center; font-size: 11px; color: #AAA; margin-top: 24px; }
</style>
</head>
<body>
<div class="header">
  <h1>Ficha Técnica ${typeLabel[ficha.type]}</h1>
  <p>${ficha.code} &nbsp;|&nbsp; ${projectName}</p>
  <p>Técnico: ${techName} &nbsp;|&nbsp; ${new Date(ficha.createdAt).toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
  <span class="badge">${statusLabel[ficha.status] ?? ficha.status}</span>
  ${ficha.latitude ? `<p style="margin-top:6px;font-size:11px;opacity:0.75;">📍 ${ficha.latitude}, ${ficha.longitude}</p>` : ''}
</div>

${bodyContent}
${signatureSection}

<div class="footer">
  Generado por STP ERP &nbsp;·&nbsp; ${new Date().toLocaleDateString('es-DO')}
</div>
</body>
</html>`;
}
