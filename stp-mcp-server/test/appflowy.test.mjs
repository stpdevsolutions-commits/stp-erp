import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { createAppflowyClient, docToMarkdown, decodeDoc, parseEncodedCollab } from '../src/appflowy.js';

/** Construye un documento con la forma de collab-document de AppFlowy. */
function docEjemplo() {
  const doc = new Y.Doc();
  const document = new Y.Map();
  doc.getMap('data').set('document', document);
  const blocks = new Y.Map();
  const meta = new Y.Map();
  const childrenMap = new Y.Map();
  const textMap = new Y.Map();
  document.set('page_id', 'p');
  document.set('blocks', blocks);
  document.set('meta', meta);
  meta.set('children_map', childrenMap);
  meta.set('text_map', textMap);
  const add = (id, ty, parent, texto, data = {}) => {
    const b = new Y.Map();
    blocks.set(id, b);
    b.set('id', id);
    b.set('ty', ty);
    b.set('parent', parent);
    b.set('children', id);
    b.set('external_id', id);
    b.set('external_type', 'text');
    b.set('data', JSON.stringify(data));
    const arr = new Y.Array();
    childrenMap.set(id, arr);
    if (texto !== null) {
      const t = new Y.Text();
      textMap.set(id, t);
      t.insert(0, texto);
    }
    return arr;
  };
  const raiz = add('p', 'page', '', null);
  const hijos = [
    ['h', 'heading', 'Proyecto Alfa', { level: 2 }],
    ['a', 'paragraph', 'Texto normal', {}],
    ['b1', 'bulleted_list', 'punto uno', {}],
    ['t1', 'todo_list', 'tarea hecha', { checked: true }],
    ['n1', 'numbered_list', 'primero', {}],
    ['n2', 'numbered_list', 'segundo', {}],
  ];
  for (const [id, ty, tx, d] of hijos) add(id, ty, 'p', tx, d);
  raiz.push(hijos.map((h) => h[0]));
  return doc;
}

/** bincode de EncodedCollab {state_vector, doc_state, version} (u64 LE + bytes, u32 versión). */
function bincode(doc, version = 0) {
  const sv = Buffer.from(Y.encodeStateVector(doc));
  const st = Buffer.from(version === 1 ? Y.encodeStateAsUpdateV2(doc) : Y.encodeStateAsUpdate(doc));
  const len = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
  const v = Buffer.alloc(4); v.writeUInt32LE(version);
  return Buffer.concat([len(sv.length), sv, len(st.length), st, v]);
}

test('decodifica bincode v1 y v2 a Markdown', () => {
  for (const version of [0, 1]) {
    const md = docToMarkdown(decodeDoc([...bincode(docEjemplo(), version)]));
    assert.match(md, /^## Proyecto Alfa$/m);
    assert.match(md, /^Texto normal$/m);
    assert.match(md, /^- punto uno$/m);
    assert.match(md, /^- \[x\] tarea hecha$/m);
    assert.match(md, /^1\. primero$/m);
    assert.match(md, /^2\. segundo$/m);
  }
});

test('si no es bincode, trata los bytes como estado Yjs directo', () => {
  const crudo = Buffer.from(Y.encodeStateAsUpdate(docEjemplo()));
  const { docState } = parseEncodedCollab(crudo);
  assert.equal(docState.length, crudo.length);
  assert.match(docToMarkdown(decodeDoc(crudo)), /Proyecto Alfa/);
});

function mockAF({ expiraEn = 3600 } = {}) {
  const llamadas = [];
  const ok = (data) => ({ ok: true, status: 200, json: async () => ({ code: 0, data }) });
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(String(url));
    llamadas.push({ path: u.pathname, method: init.method || 'GET', auth: init.headers?.Authorization });
    if (u.pathname === '/gotrue/token') return { ok: true, status: 200, json: async () => ({ access_token: 'T', expires_in: expiraEn }) };
    if (u.pathname === '/api/workspace') return ok([{ workspace_id: 'w-stp', workspace_name: 'STP' }, { workspace_id: 'w-per', workspace_name: 'Personal' }]);
    if (u.pathname === '/api/workspace/w-stp/folder') {
      return ok({ view_id: 'root', name: 'root', children: [{ view_id: 'v1', name: 'Proyectos', children: [{ view_id: 'v2', name: 'Alfa', children: [] }] }] });
    }
    if (u.pathname.startsWith('/api/workspace/w-stp/page-view/')) {
      return ok({ view: { name: u.pathname.endsWith('v2') ? 'Alfa' : 'Proyectos' }, data: { encoded_collab: [...bincode(docEjemplo())] } });
    }
    return { ok: false, status: 404, json: async () => ({ message: 'no' }) };
  };
  return { fetchImpl, llamadas };
}

test('cliente: solo hace GET (y el login), lista, lee y busca', async () => {
  const m = mockAF();
  const c = createAppflowyClient({ baseUrl: 'https://notas.test', email: 'l@x', password: 'p', fetchImpl: m.fetchImpl });
  const { paginas } = await c.arbol('stp');
  assert.deepEqual(paginas.map((p) => p.ruta), ['Proyectos', 'Proyectos / Alfa']);
  const md = await c.leerPagina('STP', 'v2');
  assert.match(md, /^# Alfa/);
  assert.match(md, /Proyecto Alfa/);
  const r = await c.buscar('STP', 'tarea hecha');
  assert.ok(r.length >= 1 && r[0].coincide === 'contenido');
  const t = await c.buscar('STP', 'alfa', { enContenido: false });
  assert.equal(t[0].coincide, 'título');
  const escrituras = m.llamadas.filter((l) => l.method !== 'GET' && l.path !== '/gotrue/token');
  assert.deepEqual(escrituras, []);
  assert.ok(m.llamadas.filter((l) => l.path.startsWith('/api')).every((l) => l.auth === 'Bearer T'));
});

test('espacio desconocido: error claro', async () => {
  const c = createAppflowyClient({ baseUrl: 'https://notas.test', email: 'l@x', password: 'p', fetchImpl: mockAF().fetchImpl });
  await assert.rejects(c.arbol('Nada'), /Espacio desconocido/);
});
