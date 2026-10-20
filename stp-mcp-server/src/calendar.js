// Google Calendar para Hermes (HRM-8). Autenticación con CUENTA DE SERVICIO
// (JWT RS256 firmado con node:crypto, sin dependencias) y llamadas REST con
// fetch inyectable para poder probarlo con mocks.
//
// Seguridad:
//  - La clave JSON vive en un archivo montado de solo lectura (GOOGLE_SA_FILE),
//    nunca en el repo ni en variables de entorno.
//  - Crear eventos exige DOS pasos: proponer (devuelve un código firmado con
//    HMAC, válido 15 min y atado a los datos exactos) y confirmar con ese
//    código. El modelo solo debe confirmar tras el "sí" explícito de Pedro.
//  - Solo se escribe en calendarios de la lista permitida.
//  - Los textos de eventos son datos NO confiables (las invitaciones externas
//    pueden traer prompt injection): se devuelven envueltos con wrapUntrusted.

import crypto from 'node:crypto';
import fs from 'node:fs';
import { wrapUntrusted, truncate, safeEqual } from './safety.js';

export const TZ = 'America/Santo_Domingo';
// RD no usa horario de verano: UTC-4 todo el año.
const OFFSET = '-04:00';
const SCOPE = 'https://www.googleapis.com/auth/calendar';
const API = 'https://www.googleapis.com/calendar/v3';
const CODE_TTL_MS = 15 * 60 * 1000;

const b64u = (x) => Buffer.from(x).toString('base64url');

/** Fecha de hoy (YYYY-MM-DD) en la zona de RD. */
export function hoyRD(nowMs = Date.now()) {
  return new Date(nowMs - 4 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Suma días a una fecha YYYY-MM-DD (aritmética de calendario pura). */
export function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const reFecha = /^\d{4}-\d{2}-\d{2}$/;
const reHora = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

export function validarFecha(f, campo = 'fecha') {
  if (typeof f !== 'string' || !reFecha.test(f) || Number.isNaN(Date.parse(`${f}T00:00:00Z`))) {
    throw new Error(`${campo} debe tener formato YYYY-MM-DD`);
  }
  return f;
}

export function validarHora(h, campo = 'hora') {
  if (typeof h !== 'string' || !reHora.test(h) || Number.isNaN(Date.parse(`${h}Z`))) {
    throw new Error(`${campo} debe tener formato YYYY-MM-DDTHH:mm (hora local de Santo Domingo, sin zona)`);
  }
  return h.length === 16 ? `${h}:00` : h;
}

/** Suma minutos a una hora local YYYY-MM-DDTHH:mm:ss (sin zona) y devuelve el mismo formato. */
export function sumarMinutos(hora, min) {
  const d = new Date(`${hora}Z`);
  d.setUTCMinutes(d.getUTCMinutes() + min);
  return d.toISOString().slice(0, 19);
}

export function cargarCuentaServicio(path) {
  const raw = JSON.parse(fs.readFileSync(path, 'utf8'));
  for (const k of ['client_email', 'private_key']) {
    if (!raw[k]) throw new Error(`La clave JSON de la cuenta de servicio no trae "${k}"`);
  }
  return { client_email: raw.client_email, private_key: raw.private_key, token_uri: raw.token_uri || 'https://oauth2.googleapis.com/token' };
}

/**
 * @param {object} opts
 * @param {{client_email:string, private_key:string, token_uri:string}} opts.sa
 * @param {string[]} [opts.calendarIds] calendarios extra (correos) además de los que ya vea la cuenta
 * @param {string} opts.secret secreto para firmar los códigos de confirmación
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {() => number} [opts.now]
 */
export function createCalendarClient({ sa, calendarIds = [], secret, fetchImpl = fetch, now = Date.now }) {
  if (!sa) throw new Error('Cuenta de servicio no configurada');
  if (!secret) throw new Error('Falta secreto para códigos de confirmación');
  let cached = null; // { token, expMs }

  async function accessToken() {
    if (cached && cached.expMs - 60_000 > now()) return cached.token;
    const iat = Math.floor(now() / 1000);
    const header = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64u(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: sa.token_uri, iat, exp: iat + 3600 }));
    const unsigned = `${header}.${claim}`;
    const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
    const res = await fetchImpl(sa.token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
      throw new Error(`Google rechazó la cuenta de servicio (${res.status}): ${body.error_description || body.error || 'sin detalle'}`);
    }
    cached = { token: body.access_token, expMs: now() + (body.expires_in || 3600) * 1000 };
    return cached.token;
  }

  async function gcal(path, { method = 'GET', query, json } = {}) {
    const url = new URL(`${API}${path}`);
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    const res = await fetchImpl(url, {
      method,
      headers: { Authorization: `Bearer ${await accessToken()}`, ...(json ? { 'Content-Type': 'application/json' } : {}) },
      body: json ? JSON.stringify(json) : undefined,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Google Calendar respondió ${res.status}: ${body?.error?.message || 'error'}`);
    }
    return body;
  }

  /** Calendarios visibles: los de la cuenta de servicio + los configurados (se suscriben si hace falta). */
  async function listCalendars() {
    const found = new Map();
    const list = await gcal('/users/me/calendarList', { query: { minAccessRole: 'reader', maxResults: 250 } });
    for (const c of list.items || []) found.set(c.id, c);
    const errores = [];
    for (const id of calendarIds) {
      if (found.has(id)) continue;
      try {
        const c = await gcal('/users/me/calendarList', { method: 'POST', json: { id } });
        found.set(c.id, c);
      } catch (err) {
        errores.push(`${id}: ${err.message}`);
      }
    }
    const calendarios = [...found.values()].map((c) => ({
      id: c.id,
      nombre: c.summaryOverride || c.summary,
      permiso: c.accessRole,
      zona: c.timeZone,
    }));
    return { calendarios, errores };
  }

  function normEvento(it, cal) {
    const todoDia = Boolean(it.start?.date);
    return {
      id: it.id,
      calendario: cal.nombre,
      calendario_id: cal.id,
      titulo: truncate(it.summary || '(sin título)', 200),
      inicio: it.start?.dateTime || it.start?.date,
      fin: it.end?.dateTime || it.end?.date,
      todo_el_dia: todoDia,
      lugar: it.location ? truncate(it.location, 200) : undefined,
      descripcion: it.description ? truncate(it.description, 400) : undefined,
      estado: it.status,
      enlace: it.htmlLink,
    };
  }

  /** Eventos entre dos fechas locales (desde incluida, hasta EXCLUIDA), de todos los calendarios o de uno. */
  async function eventos({ desde, hasta, calendarId, q, max = 50 }) {
    validarFecha(desde, 'desde');
    validarFecha(hasta, 'hasta');
    const { calendarios, errores } = await listCalendars();
    const objetivo = calendarId ? calendarios.filter((c) => c.id === calendarId) : calendarios;
    if (calendarId && objetivo.length === 0) throw new Error(`Calendario desconocido: ${calendarId}. Usa calendar_list_calendars.`);
    const out = [];
    for (const cal of objetivo) {
      try {
        const r = await gcal(`/calendars/${encodeURIComponent(cal.id)}/events`, {
          query: {
            timeMin: `${desde}T00:00:00${OFFSET}`,
            timeMax: `${hasta}T00:00:00${OFFSET}`,
            singleEvents: true,
            orderBy: 'startTime',
            timeZone: TZ,
            maxResults: max,
            q,
          },
        });
        for (const it of r.items || []) if (it.status !== 'cancelled') out.push(normEvento(it, cal));
      } catch (err) {
        errores.push(`${cal.nombre || cal.id}: ${err.message}`);
      }
    }
    out.sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));
    return { eventos: out.slice(0, max), errores };
  }

  // ── Crear con confirmación previa ──────────────────────────────────────────
  function normalizarNuevo(p) {
    if (!p.titulo || typeof p.titulo !== 'string') throw new Error('titulo es obligatorio');
    const ev = { calendar_id: p.calendar_id, titulo: p.titulo.trim().slice(0, 200) };
    if (p.todo_el_dia) {
      ev.todo_el_dia = true;
      ev.fecha = validarFecha(p.fecha, 'fecha');
    } else {
      ev.inicio = validarHora(p.inicio, 'inicio');
      ev.fin = p.fin ? validarHora(p.fin, 'fin') : sumarMinutos(ev.inicio, p.duracion_min || 60);
      if (ev.fin <= ev.inicio) throw new Error('fin debe ser posterior a inicio');
    }
    if (p.lugar) ev.lugar = String(p.lugar).slice(0, 300);
    if (p.descripcion) ev.descripcion = String(p.descripcion).slice(0, 2000);
    return ev;
  }

  const firmar = (ev, exp) =>
    crypto.createHmac('sha256', secret).update(`${exp}.${JSON.stringify(ev)}`).digest('base64url');

  async function calendarioEscribible(id) {
    const { calendarios } = await listCalendars();
    const cal = calendarios.find((c) => c.id === id);
    if (!cal) throw new Error(`Calendario desconocido: ${id}. Usa calendar_list_calendars.`);
    if (!['owner', 'writer'].includes(cal.permiso)) {
      throw new Error(`No hay permiso de edición en "${cal.nombre}" (permiso: ${cal.permiso}). Pedro debe compartirlo con "Hacer cambios en eventos".`);
    }
    return cal;
  }

  async function proponerEvento(p) {
    const ev = normalizarNuevo(p);
    const cal = await calendarioEscribible(ev.calendar_id);
    const exp = now() + CODE_TTL_MS;
    return {
      resumen: ev,
      calendario: cal.nombre,
      codigo_confirmacion: `${exp}.${firmar(ev, exp)}`,
      expira: new Date(exp).toISOString(),
    };
  }

  async function crearEvento(p, codigo) {
    const ev = normalizarNuevo(p);
    const exp = Number(String(codigo || '').split('.')[0]);
    if (!exp || !safeEqual(`${exp}.${firmar(ev, exp)}`, String(codigo))) {
      throw new Error('Código de confirmación inválido: los datos no coinciden con los propuestos. Vuelve a proponer el evento.');
    }
    if (exp < now()) throw new Error('El código de confirmación expiró. Vuelve a proponer el evento.');
    await calendarioEscribible(ev.calendar_id);
    const body = { summary: ev.titulo, location: ev.lugar, description: ev.descripcion };
    if (ev.todo_el_dia) {
      body.start = { date: ev.fecha };
      body.end = { date: sumarDias(ev.fecha, 1) };
    } else {
      body.start = { dateTime: ev.inicio, timeZone: TZ };
      body.end = { dateTime: ev.fin, timeZone: TZ };
    }
    const r = await gcal(`/calendars/${encodeURIComponent(ev.calendar_id)}/events`, { method: 'POST', json: body });
    return { id: r.id, enlace: r.htmlLink, titulo: r.summary };
  }

  return { listCalendars, eventos, proponerEvento, crearEvento, accessToken };
}

/** Texto para el modelo: los títulos/descripciones son datos no confiables. */
export function envolverEventos(data, etiqueta = 'eventos de Google Calendar') {
  return wrapUntrusted(JSON.stringify(data), etiqueta);
}
