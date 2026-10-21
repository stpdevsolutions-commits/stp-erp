// Lectura del ESPEJO EN MARKDOWN de la documentación de Pedro (HRM-9, plan B).
//
// La documentación vive en AppFlowy (fuente: C:\Users\pedro\doc-build, que
// genera también esta copia en Markdown). Como AppFlowy no permite crear un
// usuario invitado (licencia de 1 asiento), Hermes lee un espejo de SOLO
// LECTURA montado en el contenedor (volumen `:ro`), con esta forma:
//
//   <DOCS_DIR>/stp/...       workspace STP
//   <DOCS_DIR>/personal/...  workspace Personal
//   <DOCS_DIR>/_generado.txt marca de tiempo del espejo
//
// Cada página es un .md; una carpeta con subpáginas tiene un `_indice.md`.
// SEGURIDAD: solo lee (fs.readFile/readdir), resuelve rutas con realpath y
// exige quedarse dentro de la raíz (sin path traversal ni symlinks que se
// escapen), limita tamaños y NUNCA interpreta el contenido.

import fs from 'node:fs/promises';
import path from 'node:path';

export const ESPACIOS = { stp: 'stp', personal: 'personal' };
const MAX_ARCHIVO = 1_000_000; // bytes; páginas mayores se rechazan
const MAX_PAGINAS = 2000;
const MAX_BUSQUEDA_CHARS = 100;
const STOPWORDS = new Set(['de', 'la', 'el', 'los', 'las', 'y', 'en', 'un', 'una', 'del', 'para', 'por', 'con', 'que', 'al', 'lo', 'se', 'su', 'es', 'a', 'o']);

/** Minúsculas y sin tildes, para comparar. */
export function normalizar(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** "STP"/"stp"/"Personal" -> clave de carpeta, o null. */
export function resolverEspacio(nombre) {
  const k = normalizar(nombre).trim();
  return ESPACIOS[k] ?? null;
}

/**
 * Sanea una ruta relativa de página (la que da notas_listar). Devuelve los
 * segmentos o lanza si trae algo sospechoso. Acepta con o sin ".md".
 */
export function sanearRuta(ruta) {
  if (typeof ruta !== 'string') throw new Error('La ruta debe ser texto');
  if (ruta.length === 0 || ruta.length > 300) throw new Error('Ruta vacía o demasiado larga');
  if (/[\0\\]/.test(ruta)) throw new Error('Ruta no válida');
  if (ruta.startsWith('/') || /^[a-zA-Z]:/.test(ruta)) throw new Error('La ruta debe ser relativa');
  const segs = ruta.split('/').filter((s) => s !== '' && s !== '.');
  if (segs.length === 0) throw new Error('Ruta vacía');
  for (const s of segs) {
    if (s === '..' || s.startsWith('.')) throw new Error('Ruta no válida');
    // Solo caracteres de nombres de archivo generados por slug(): letras, números, guion, guion bajo y punto.
    if (!/^[A-Za-z0-9_.-]+$/.test(s)) throw new Error('Ruta no válida (usa la ruta tal como la devuelve notas_listar)');
  }
  return segs;
}

/** Quita un plural simple (respaldos -> respaldo) para que la búsqueda por subcadena coincida. */
function singular(t) {
  if (t.length > 5 && t.endsWith('es')) return t.slice(0, -2);
  if (t.length > 4 && t.endsWith('s')) return t.slice(0, -1);
  return t;
}

export function createDocsMirror({ root }) {
  if (!root) throw new Error('Falta DOCS_DIR (espejo de documentación)');
  let cache = null; // { clave, paginas }

  async function raizReal() {
    try {
      return await fs.realpath(root);
    } catch {
      throw new Error('El espejo de documentación aún no existe (falta sincronizar con sync_mirror.sh).');
    }
  }

  /** ¿`p` (ya con realpath) está dentro de `raiz`? */
  function dentro(raiz, p) {
    return p === raiz || p.startsWith(raiz + path.sep);
  }

  async function generado(raiz) {
    try {
      return (await fs.readFile(path.join(raiz, '_generado.txt'), 'utf8')).trim().slice(0, 100);
    } catch {
      return null;
    }
  }

  function tituloDe(md, respaldo) {
    const m = /^#\s+(.+)$/m.exec(md.slice(0, 600));
    return m ? m[1].trim() : respaldo;
  }

  /** Recorre un espacio y devuelve [{ruta, titulo, archivo, bytes}] (sin leer más que el encabezado). */
  async function recorrer(raiz, espacio) {
    const base = path.join(raiz, espacio);
    const out = [];
    async function walk(dir, rel) {
      const ents = await fs.readdir(dir, { withFileTypes: true });
      ents.sort((a, b) => a.name.localeCompare(b.name));
      for (const e of ents) {
        if (out.length >= MAX_PAGINAS) return;
        if (e.name.startsWith('.')) continue;
        const abs = path.join(dir, e.name);
        if (e.isSymbolicLink()) continue; // el espejo no usa symlinks internos
        if (e.isDirectory()) {
          await walk(abs, rel ? `${rel}/${e.name}` : e.name);
        } else if (e.isFile() && e.name.endsWith('.md')) {
          const st = await fs.stat(abs);
          if (st.size > MAX_ARCHIVO) continue;
          const nombre = e.name.slice(0, -3);
          // _indice.md representa a su carpeta
          const ruta = nombre === '_indice' ? rel : rel ? `${rel}/${nombre}` : nombre;
          if (!ruta) continue;
          const md = await fs.readFile(abs, 'utf8');
          out.push({ ruta, titulo: tituloDe(md, nombre), archivo: abs, bytes: st.size, md });
        }
      }
    }
    try {
      await walk(base, '');
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
    return out;
  }

  /** Índice con cache invalidado cuando cambia el destino real del espejo o su marca de tiempo. */
  async function indice() {
    const raiz = await raizReal();
    const marca = await generado(raiz);
    const clave = `${raiz}|${marca}`;
    if (cache && cache.clave === clave) return { raiz, marca, paginas: cache.paginas };
    const paginas = [];
    for (const esp of Object.values(ESPACIOS)) {
      for (const p of await recorrer(raiz, esp)) paginas.push({ espacio: esp, ...p });
    }
    cache = { clave, paginas };
    return { raiz, marca, paginas };
  }

  async function listar(espacio, { profundidad = 3, prefijo } = {}) {
    const { marca, paginas } = await indice();
    let sel = paginas;
    if (espacio) {
      const esp = resolverEspacio(espacio);
      if (!esp) throw new Error('Espacio desconocido. Usa "STP" o "Personal".');
      sel = sel.filter((p) => p.espacio === esp);
    }
    if (prefijo) sel = sel.filter((p) => p.ruta === prefijo || p.ruta.startsWith(`${prefijo}/`));
    const base = prefijo ? prefijo.split('/').length - 1 : 0;
    sel = sel.filter((p) => p.ruta.split('/').length - base <= profundidad);
    return {
      espejo_generado: marca,
      paginas: sel.map((p) => ({
        espacio: p.espacio === 'stp' ? 'STP' : 'Personal',
        titulo: p.titulo,
        // `ruta` es lo que se pasa a notas_leer_pagina (junto al espacio). `view_id` es un alias de compatibilidad.
        ruta: p.ruta,
        view_id: p.ruta,
      })),
    };
  }

  async function leerPagina(espacio, ruta, { desde = 0, max = 12000 } = {}) {
    const esp = resolverEspacio(espacio);
    if (!esp) throw new Error('Espacio desconocido. Usa "STP" o "Personal".');
    const segs = sanearRuta(ruta);
    const raiz = await raizReal();
    const rel = segs.join('/').replace(/\.md$/, '');
    const candidatos = [path.join(raiz, esp, `${rel}.md`), path.join(raiz, esp, rel, '_indice.md')];
    const base = path.join(raiz, esp);
    for (const c of candidatos) {
      let real;
      try {
        real = await fs.realpath(c);
      } catch {
        continue;
      }
      if (!dentro(base, real) || !real.endsWith('.md')) continue; // defensa: symlinks que se escapen
      const st = await fs.stat(real);
      if (!st.isFile()) continue;
      if (st.size > MAX_ARCHIVO) throw new Error('La página es demasiado grande para leerla');
      const md = await fs.readFile(real, 'utf8');
      const ini = Math.max(0, Math.floor(desde) || 0);
      const trozo = md.slice(ini, ini + max);
      const resto = md.length - (ini + trozo.length);
      return {
        espejo_generado: await generado(raiz),
        ruta: rel,
        caracteres_totales: md.length,
        texto: trozo + (resto > 0 ? `\n\n…[quedan ${resto} caracteres; vuelve a llamar con desde=${ini + trozo.length}]` : ''),
      };
    }
    throw new Error(`No existe la página "${rel}" en ${esp === 'stp' ? 'STP' : 'Personal'}. Usa notas_listar o notas_buscar para ver las rutas.`);
  }

  async function buscar(espacio, consulta, { max = 8 } = {}) {
    const q = String(consulta ?? '').slice(0, MAX_BUSQUEDA_CHARS);
    const tokens = normalizar(q).split(/[^a-z0-9ñ.\-_]+/).filter((t) => t.length >= 2 && !STOPWORDS.has(t)).map(singular);
    if (tokens.length === 0) throw new Error('Escribe al menos una palabra de 2 letras para buscar');
    const { marca, paginas } = await indice();
    let sel = paginas;
    if (espacio) {
      const esp = resolverEspacio(espacio);
      if (!esp) throw new Error('Espacio desconocido. Usa "STP" o "Personal".');
      sel = sel.filter((p) => p.espacio === esp);
    }
    const minimo = Math.max(1, Math.ceil(tokens.length * 0.6));
    const res = [];
    for (const p of sel) {
      const titulo = normalizar(p.titulo);
      const rutaN = normalizar(p.ruta);
      const cuerpo = normalizar(p.md);
      let presentes = 0;
      let score = 0;
      let primero = -1;
      for (const t of tokens) {
        const enT = titulo.includes(t);
        const enR = rutaN.includes(t);
        const idx = cuerpo.indexOf(t);
        if (enT || enR || idx >= 0) presentes++;
        if (enT) score += 10;
        if (enR) score += 4;
        if (idx >= 0) {
          score += 1 + Math.min(5, cuerpo.split(t).length - 2);
          if (primero < 0 || idx < primero) primero = idx;
        }
      }
      if (presentes < minimo) continue;
      score += presentes * 3;
      // El fragmento sale del texto original (la normalización conserva la longitud salvo casos raros; se acota).
      const i = Math.min(Math.max(0, primero), Math.max(0, p.md.length - 1));
      const fragmento = primero >= 0 ? p.md.slice(Math.max(0, i - 100), i + 220).replace(/\s+/g, ' ').trim() : p.md.slice(0, 200).replace(/\s+/g, ' ');
      res.push({
        espacio: p.espacio === 'stp' ? 'STP' : 'Personal',
        titulo: p.titulo,
        ruta: p.ruta,
        view_id: p.ruta,
        coincidencias: `${presentes}/${tokens.length} palabras`,
        fragmento,
        _score: score,
      });
    }
    res.sort((a, b) => b._score - a._score);
    return {
      espejo_generado: marca,
      resultados: res.slice(0, Math.min(Math.max(1, max), 15)).map(({ _score, ...r }) => r),
      total_coincidencias: res.length,
    };
  }

  return { listar, leerPagina, buscar };
}
