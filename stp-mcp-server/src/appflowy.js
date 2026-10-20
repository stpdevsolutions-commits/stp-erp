// Lectura de AppFlowy Cloud (notas.stpsoluciones.com) para Hermes (HRM-9).
//
// SOLO LECTURA y con un usuario INVITADO ("guest") dedicado, nunca con las
// credenciales de Pedro: aunque el modelo quisiera escribir, este módulo solo
// hace GET y la cuenta no tiene permiso de edición. Credenciales en
// APPFLOWY_RO_EMAIL / APPFLOWY_RO_PASSWORD (~/stp/.env, nunca en git).
//
// El contenido de una página viene como documento Yjs (colaborativo) dentro de
// `encoded_collab` (bincode de EncodedCollab). Se decodifica a Markdown simple.

import * as Y from 'yjs';

/** Parsea bincode (little-endian, longitudes u64) de EncodedCollab {state_vector, doc_state, version}. */
export function parseEncodedCollab(bytes) {
  const buf = Buffer.from(bytes);
  try {
    let o = 0;
    const leer = () => {
      const len = Number(buf.readBigUInt64LE(o));
      o += 8;
      if (len < 0 || o + len > buf.length) throw new Error('longitud fuera de rango');
      const s = buf.subarray(o, o + len);
      o += len;
      return s;
    };
    leer(); // state_vector
    const docState = leer();
    const version = o + 4 <= buf.length ? buf.readUInt32LE(o) : 0;
    return { docState, version };
  } catch {
    return { docState: buf, version: 0 };
  }
}

export function decodeDoc(bytes) {
  const { docState, version } = parseEncodedCollab(bytes);
  const doc = new Y.Doc();
  if (version === 1) Y.applyUpdateV2(doc, docState);
  else Y.applyUpdate(doc, docState);
  return doc;
}

const textoDe = (t) => (t && typeof t.toString === 'function' ? String(t.toString()) : '');

function jsonSeguro(s) {
  if (s && typeof s === 'object') return typeof s.toJSON === 'function' ? s.toJSON() : s;
  try {
    return JSON.parse(s || '{}');
  } catch {
    return {};
  }
}

/** Convierte un documento de AppFlowy (Y.Doc) en Markdown simple. */
export function docToMarkdown(doc) {
  const root = doc.getMap('data');
  const document = root.get('document');
  if (!document) {
    // Estructura inesperada: devolver todo el texto que haya.
    return JSON.stringify(root.toJSON());
  }
  const blocks = document.get('blocks');
  const meta = document.get('meta');
  const childrenMap = meta?.get('children_map');
  const textMap = meta?.get('text_map');
  const pageId = document.get('page_id');

  const lineas = [];
  const visitados = new Set();
  const hijosDe = (b) => {
    const key = b.get('children') ?? b.get('id');
    const arr = childrenMap?.get(key);
    return arr ? arr.toArray() : [];
  };

  function render(id, prof, num) {
    if (visitados.has(id)) return;
    visitados.add(id);
    const b = blocks.get(id);
    if (!b) return;
    const ty = b.get('ty');
    const data = jsonSeguro(b.get('data'));
    const ext = b.get('external_id');
    const texto = ext ? textoDe(textMap?.get(ext)) : '';
    const sang = '  '.repeat(prof);
    switch (ty) {
      case 'page':
        break;
      case 'heading':
        lineas.push(`${'#'.repeat(Math.min(Number(data.level) || 1, 6))} ${texto}`);
        break;
      case 'bulleted_list':
        lineas.push(`${sang}- ${texto}`);
        break;
      case 'numbered_list':
        lineas.push(`${sang}${num}. ${texto}`);
        break;
      case 'todo_list':
        lineas.push(`${sang}- [${data.checked ? 'x' : ' '}] ${texto}`);
        break;
      case 'quote':
        lineas.push(`> ${texto}`);
        break;
      case 'code':
        lineas.push('```' + (data.language || ''), texto, '```');
        break;
      case 'divider':
        lineas.push('---');
        break;
      case 'callout':
      case 'toggle_list':
      case 'paragraph':
      default:
        if (texto) lineas.push(`${sang}${texto}`);
    }
    const hijos = hijosDe(b);
    let n = 0;
    for (const h of hijos) {
      const hb = blocks.get(h);
      n = hb?.get('ty') === 'numbered_list' ? n + 1 : 0;
      render(h, ty === 'page' ? prof : prof + 1, n || 1);
    }
  }

  render(pageId, 0, 1);
  return lineas.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function createAppflowyClient({ baseUrl, email, password, fetchImpl = fetch, now = Date.now }) {
  if (!baseUrl || !email || !password) throw new Error('AppFlowy de solo lectura no configurado');
  let tok = null; // { token, expMs }
  const cachePaginas = new Map(); // `${ws}/${view}` -> { md, ts }

  async function login() {
    const res = await fetchImpl(`${baseUrl}/gotrue/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
      throw new Error(`Login del usuario lector de AppFlowy falló (${res.status}). ¿Existe y fue invitado como invitado?`);
    }
    tok = { token: body.access_token, expMs: now() + (body.expires_in || 3600) * 1000 };
    return tok.token;
  }

  async function get(path, query) {
    if (!tok || tok.expMs - 60_000 < now()) await login();
    const url = new URL(`${baseUrl}${path}`);
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const res = await fetchImpl(url, { method: 'GET', headers: { Authorization: `Bearer ${tok.token}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || (body && typeof body.code === 'number' && body.code !== 0)) {
      throw new Error(`AppFlowy respondió ${res.status}: ${body?.message || 'error'}`);
    }
    return body.data;
  }

  async function workspaces() {
    const list = await get('/api/workspace');
    return (list || []).map((w) => ({ id: w.workspace_id, nombre: w.workspace_name }));
  }

  async function resolverWorkspace(nombreOId) {
    const ws = await workspaces();
    const w = ws.find((x) => x.id === nombreOId || x.nombre.toLowerCase() === String(nombreOId).toLowerCase());
    if (!w) throw new Error(`Espacio desconocido "${nombreOId}". Disponibles: ${ws.map((x) => x.nombre).join(', ') || '(ninguno: falta invitar al usuario lector)'}`);
    return w;
  }

  function aplanar(v, ruta = '') {
    const out = [];
    for (const h of v.children || []) {
      const r = ruta ? `${ruta} / ${h.name}` : h.name;
      out.push({ view_id: h.view_id, titulo: h.name, ruta: r, editado: h.last_edited_time });
      out.push(...aplanar(h, r));
    }
    return out;
  }

  async function arbol(workspace, depth = 3) {
    const w = await resolverWorkspace(workspace);
    const folder = await get(`/api/workspace/${w.id}/folder`, { depth });
    return { workspace: w, paginas: aplanar(folder) };
  }

  async function leerPagina(workspace, viewId) {
    const w = await resolverWorkspace(workspace);
    const clave = `${w.id}/${viewId}`;
    const c = cachePaginas.get(clave);
    if (c && now() - c.ts < 10 * 60_000) return c.md;
    const page = await get(`/api/workspace/${w.id}/page-view/${encodeURIComponent(viewId)}`);
    const bytes = page?.data?.encoded_collab;
    if (!bytes) throw new Error('La página no trae contenido de documento (¿es una base de datos?)');
    const md = `# ${page.view?.name || ''}\n\n${docToMarkdown(decodeDoc(bytes))}`;
    cachePaginas.set(clave, { md, ts: now() });
    return md;
  }

  async function buscar(workspace, texto, { enContenido = true, max = 10 } = {}) {
    const q = texto.toLowerCase();
    const { paginas } = await arbol(workspace, 6);
    const res = [];
    for (const p of paginas) {
      if (p.titulo.toLowerCase().includes(q)) res.push({ ...p, coincide: 'título' });
    }
    if (enContenido) {
      const pendientes = paginas.filter((p) => !res.some((r) => r.view_id === p.view_id));
      for (let i = 0; i < pendientes.length && res.length < max; i += 5) {
        const lote = pendientes.slice(i, i + 5);
        const mds = await Promise.allSettled(lote.map((p) => leerPagina(workspace, p.view_id)));
        mds.forEach((r, j) => {
          if (r.status !== 'fulfilled') return;
          const idx = r.value.toLowerCase().indexOf(q);
          if (idx >= 0) {
            res.push({ ...lote[j], coincide: 'contenido', fragmento: r.value.slice(Math.max(0, idx - 80), idx + 160).replace(/\s+/g, ' ') });
          }
        });
      }
    }
    return res.slice(0, max);
  }

  return { workspaces, arbol, leerPagina, buscar };
}
