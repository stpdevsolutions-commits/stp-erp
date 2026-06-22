import { Ficha, FichaType } from './entities/ficha.entity';
import { FichaElectricaData } from './types/ficha-electrica.types';

// ── Utilidades ───────────────────────────────────────────────────────────────

function esc(s: unknown): string {
  if (s == null) return '—';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function bool(v: unknown): string {
  return v === true ? 'Sí' : v === false ? 'No' : '—';
}

function row(label: string, value: unknown): string {
  return `<tr><td class="lbl">${esc(label)}</td><td>${esc(value)}</td></tr>`;
}

function section(title: string, content: string): string {
  return `<div class="section"><h3>${esc(title)}</h3>${content}</div>`;
}

function materialesTable(
  items: { descripcion?: string; cantidad?: number; unidad?: string }[],
): string {
  const rows = items
    .map((m) => `<tr><td>${esc(m.descripcion)}</td><td>${esc(m.cantidad)} ${esc(m.unidad)}</td></tr>`)
    .join('');
  return `<table><thead><tr><th>Descripción</th><th>Cantidad</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ── Generadores por tipo ─────────────────────────────────────────────────────

function electricaHtml(d: FichaElectricaData): string {
  const tipoTrabajo: Record<string, string> = {
    instalacion_nueva: 'Instalación nueva', remodelacion: 'Remodelación',
    mantenimiento: 'Mantenimiento', diagnostico: 'Diagnóstico',
  };
  const fases: Record<string, string> = {
    monofasico: 'Monofásico', bifasico: 'Bifásico', trifasico: 'Trifásico',
  };

  let html = section('Información general', `<table>
    ${row('Tipo de trabajo', tipoTrabajo[d.tipoTrabajo] ?? d.tipoTrabajo)}
    ${row('Voltaje de servicio', d.voltajeServicio)}
    ${row('Fases', fases[d.fases] ?? d.fases)}
  </table>`);

  if (d.tableros?.length) {
    const items = d.tableros.map((t) => `
      <div class="item">
        <strong>${esc(t.nombre) || 'Sin nombre'}</strong>
        <table>
          ${row('Tipo', t.tipo)}
          ${row('Amperaje', `${t.amperaje} A`)}
          ${row('Voltaje', t.voltaje)}
          ${row('Fases', fases[t.fases] ?? t.fases)}
          ${row('Estado', t.estado)}
          ${t.observaciones ? row('Observaciones', t.observaciones) : ''}
        </table>
      </div>`).join('');
    html += section(`Tableros (${d.tableros.length})`, items);
  }

  if (d.circuitos?.length) {
    const items = d.circuitos.map((c) => `
      <div class="item">
        <strong>#${esc(c.numero)} — ${esc(c.descripcion)}</strong>
        <table>
          ${row('Breaker', `${c.breakerA} A`)}
          ${row('Calibre', `AWG #${c.calibreAWG}`)}
          ${row('Tipo', c.tipo)}
          ${c.longitud ? row('Longitud', `${c.longitud} m`) : ''}
          ${row('Estado', c.estado)}
        </table>
      </div>`).join('');
    html += section(`Circuitos (${d.circuitos.length})`, items);
  }

  if (d.materiales?.length) {
    html += section(`Materiales (${d.materiales.length})`, materialesTable(d.materiales));
  }

  if (d.observacionesGenerales) {
    html += section('Observaciones generales', `<p>${esc(d.observacionesGenerales)}</p>`);
  }
  if (d.recomendaciones) {
    html += section('Recomendaciones', `<p>${esc(d.recomendaciones)}</p>`);
  }

  return html;
}

function civilHtml(d: Record<string, unknown>): string {
  const tipoTrabajo: Record<string, string> = {
    obra_nueva: 'Obra nueva', remodelacion: 'Remodelación',
    reparacion: 'Reparación', diagnostico: 'Diagnóstico',
  };
  const estadoLabel: Record<string, string> = {
    bueno: 'Bueno', regular: 'Regular', malo: 'Malo', critico: 'Crítico',
  };

  let html = section('Información general', `<table>
    ${row('Tipo de trabajo', tipoTrabajo[d.tipoTrabajo as string] ?? esc(d.tipoTrabajo))}
  </table>`);

  const areas = (d.areas as Record<string, unknown>[] | undefined) ?? [];
  if (areas.length) {
    const items = areas.map((a) => `
      <div class="item">
        <strong>${esc(a.nombre)}</strong>
        <table>
          ${row('Dimensiones', `${esc(a.largo)} m × ${esc(a.ancho)} m × ${esc(a.alto)} m`)}
          ${row('Piso', a.pisoMaterial)}
          ${row('Paredes', a.paredesMaterial)}
          ${row('Techo', a.techMaterial)}
          ${row('Estado', estadoLabel[a.estado as string] ?? esc(a.estado))}
          ${a.observaciones ? row('Observaciones', a.observaciones) : ''}
        </table>
      </div>`).join('');
    html += section(`Áreas (${areas.length})`, items);
  }

  const estructura = d.estructura as Record<string, unknown> | undefined;
  if (estructura) {
    html += section('Estructura', `<table>
      ${estructura.tipoFundacion ? row('Fundación', estructura.tipoFundacion) : ''}
      ${estructura.tipoColumnas ? row('Columnas', estructura.tipoColumnas) : ''}
      ${row('Estado general', estadoLabel[estructura.estadoGeneral as string] ?? esc(estructura.estadoGeneral))}
      ${estructura.observaciones ? row('Observaciones', estructura.observaciones) : ''}
    </table>`);
  }

  const materiales = (d.materiales as Record<string, unknown>[] | undefined) ?? [];
  if (materiales.length) {
    html += section(`Materiales (${materiales.length})`, materialesTable(
      materiales as { descripcion?: string; cantidad?: number; unidad?: string }[],
    ));
  }

  if (d.observacionesGenerales) {
    html += section('Observaciones generales', `<p>${esc(d.observacionesGenerales)}</p>`);
  }
  if (d.recomendaciones) {
    html += section('Recomendaciones', `<p>${esc(d.recomendaciones)}</p>`);
  }

  return html;
}

function electromecanicaHtml(d: Record<string, unknown>): string {
  const tipoTrabajo: Record<string, string> = {
    instalacion_nueva: 'Instalación nueva', mantenimiento: 'Mantenimiento',
    reparacion: 'Reparación', diagnostico: 'Diagnóstico',
  };
  const estadoLabel: Record<string, string> = {
    bueno: 'Bueno', regular: 'Regular', malo: 'Malo', inoperante: 'Inoperante',
  };

  let html = section('Información general', `<table>
    ${row('Tipo de trabajo', tipoTrabajo[d.tipoTrabajo as string] ?? esc(d.tipoTrabajo))}
  </table>`);

  const equipos = (d.equipos as Record<string, unknown>[] | undefined) ?? [];
  if (equipos.length) {
    const items = equipos.map((e) => `
      <div class="item">
        <strong>${esc(e.nombre)}</strong>
        <table>
          ${row('Marca', e.marca)}
          ${e.modelo ? row('Modelo', e.modelo) : ''}
          ${e.serial ? row('Serial', e.serial) : ''}
          ${e.potenciaHP ? row('Potencia', `${esc(e.potenciaHP)} HP`) : ''}
          ${row('Voltaje', e.voltaje)}
          ${e.corrienteA ? row('Corriente', `${esc(e.corrienteA)} A`) : ''}
          ${row('Estado', estadoLabel[e.estado as string] ?? esc(e.estado))}
          ${e.observaciones ? row('Observaciones', e.observaciones) : ''}
        </table>
      </div>`).join('');
    html += section(`Equipos (${equipos.length})`, items);
  }

  const mediciones = d.mediciones as Record<string, unknown> | undefined;
  if (mediciones && Object.values(mediciones).some((v) => v != null && v !== '')) {
    html += section('Mediciones', `<table>
      ${mediciones.presionPSI != null ? row('Presión', `${esc(mediciones.presionPSI)} PSI`) : ''}
      ${mediciones.temperaturaCelsius != null ? row('Temperatura', `${esc(mediciones.temperaturaCelsius)} °C`) : ''}
      ${mediciones.vibracion ? row('Vibración', mediciones.vibracion) : ''}
      ${mediciones.ruido ? row('Ruido', mediciones.ruido) : ''}
    </table>`);
  }

  const materiales = (d.materiales as Record<string, unknown>[] | undefined) ?? [];
  if (materiales.length) {
    html += section(`Materiales (${materiales.length})`, materialesTable(
      materiales as { descripcion?: string; cantidad?: number; unidad?: string }[],
    ));
  }

  if (d.observacionesGenerales) {
    html += section('Observaciones generales', `<p>${esc(d.observacionesGenerales)}</p>`);
  }
  if (d.recomendaciones) {
    html += section('Recomendaciones', `<p>${esc(d.recomendaciones)}</p>`);
  }

  return html;
}

function levantamientoHtml(d: Record<string, unknown>): string {
  const propositoLabel: Record<string, string> = {
    presupuesto: 'Presupuesto', inventario: 'Inventario',
    diagnostico: 'Diagnóstico', otro: 'Otro',
  };
  const estadoLabel: Record<string, string> = {
    bueno: 'Bueno', regular: 'Regular', malo: 'Malo',
  };

  let html = section('Información general', `<table>
    ${row('Propósito', propositoLabel[d.proposito as string] ?? esc(d.proposito))}
  </table>`);

  const items = (d.items as Record<string, unknown>[] | undefined) ?? [];
  if (items.length) {
    const itemRows = items.map((i) => `
      <tr>
        <td>${esc(i.descripcion)}</td>
        <td>${esc(i.ubicacion)}</td>
        <td>${esc(i.cantidad)} ${esc(i.unidad)}</td>
        <td>${estadoLabel[i.estado as string] ?? esc(i.estado)}</td>
        <td>${esc(i.observaciones)}</td>
      </tr>`).join('');
    html += section(`Inventario (${items.length} ítems)`, `
      <table>
        <thead><tr>
          <th>Descripción</th><th>Ubicación</th><th>Cantidad</th><th>Estado</th><th>Observaciones</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>`);
  }

  if (d.observacionesGenerales) {
    html += section('Observaciones generales', `<p>${esc(d.observacionesGenerales)}</p>`);
  }

  return html;
}

function evaluacionHtml(d: Record<string, unknown>): string {
  const causaLabel: Record<string, string> = {
    humedad: 'Humedad', sismo: 'Sismo', viento: 'Viento', incendio: 'Incendio',
    vandalismo: 'Vandalismo', deterioro: 'Deterioro', otro: 'Otro',
  };
  const urgenciaLabel: Record<string, string> = {
    inmediata: 'Inmediata', alta: 'Alta', media: 'Media', baja: 'Baja',
  };
  const severidadLabel: Record<string, string> = {
    leve: 'Leve', moderado: 'Moderado', grave: 'Grave', total: 'Pérdida total',
  };

  let html = section('Resumen de la evaluación', `<table>
    ${row('Causa del daño', causaLabel[d.causaDano as string] ?? esc(d.causaDano))}
    ${row('Urgencia de intervención', urgenciaLabel[d.urgencia as string] ?? esc(d.urgencia))}
    ${row('Estructura afectada', bool(d.estructuraAfectada))}
    ${row('Riesgo para personas', bool(d.riesgoPersonas))}
    ${d.costoEstimado != null ? row('Costo estimado', `RD$ ${Number(d.costoEstimado).toLocaleString('es-DO')}`) : ''}
  </table>`);

  const areas = (d.areas as Record<string, unknown>[] | undefined) ?? [];
  if (areas.length) {
    const items = areas.map((a) => `
      <div class="item">
        <strong>${esc(a.nombre)}</strong>
        <table>
          ${row('Severidad', severidadLabel[a.severidad as string] ?? esc(a.severidad))}
          ${row('Descripción del daño', a.descripcionDano)}
          ${row('Acción recomendada', a.accionRecomendada)}
        </table>
      </div>`).join('');
    html += section(`Áreas dañadas (${areas.length})`, items);
  }

  if (d.observacionesGenerales) {
    html += section('Observaciones generales', `<p>${esc(d.observacionesGenerales)}</p>`);
  }

  return html;
}

// ── Entrada principal ────────────────────────────────────────────────────────

export function generateFichaPdfHtml(ficha: Ficha): string {
  const typeLabel: Record<FichaType, string> = {
    electrico: 'Eléctrica',
    civil: 'Civil',
    electromecanico: 'Electromecánica',
    levantamiento: 'Levantamiento general',
    evaluacion_danos: 'Evaluación de daños',
  };

  const statusLabel: Record<string, string> = {
    borrador: 'Borrador', en_progreso: 'En progreso', enviada: 'Enviada',
  };

  const projectName = (ficha.project as unknown as { name?: string })?.name ?? '—';
  const tech = ficha.technician as unknown as { firstName?: string; lastName?: string } | undefined;
  const techName = tech ? `${tech.firstName ?? ''} ${tech.lastName ?? ''}`.trim() : '—';
  const d = ficha.data as Record<string, unknown>;

  let bodyContent: string;
  switch (ficha.type) {
    case FichaType.ELECTRICO:
      bodyContent = electricaHtml(ficha.data as unknown as FichaElectricaData);
      break;
    case FichaType.CIVIL:
      bodyContent = civilHtml(d);
      break;
    case FichaType.ELECTROMECANICO:
      bodyContent = electromecanicaHtml(d);
      break;
    case FichaType.LEVANTAMIENTO:
      bodyContent = levantamientoHtml(d);
      break;
    case FichaType.EVALUACION_DANOS:
      bodyContent = evaluacionHtml(d);
      break;
    default:
      bodyContent = section('Datos', `<pre style="font-size:12px;white-space:pre-wrap;">${JSON.stringify(d, null, 2)}</pre>`);
  }

  const signatureSection = ficha.signature
    ? section('Firma del técnico', `<div class="sig-container"><svg width="300" height="120" xmlns="http://www.w3.org/2000/svg">${
        (ficha.signature as string).split('|').map((path) =>
          `<path d="${path}" stroke="#1565C0" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
        ).join('')
      }</svg></div>`)
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Ficha ${ficha.code}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #222; padding: 24px; max-width: 860px; margin: 0 auto; }
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
  .footer { text-align: center; font-size: 11px; color: #AAA; margin-top: 24px; padding-top: 12px; border-top: 1px solid #EEE; }
  @media print {
    body { padding: 0; }
    .header { border-radius: 0; }
    .section { page-break-inside: avoid; }
  }
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
