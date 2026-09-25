/**
 * Emparejamiento de una descripción de cotización ("ALAMBRE ST THHN #12 NEGRO")
 * con un material del catálogo ("Cable #12"). Lógica pura.
 *
 * Antes se exigía que TODAS las palabras de la cotización estuvieran en el
 * nombre del catálogo: bastaba un "negro" o un "ST" de más para no encontrar
 * nada, y como una línea sin material no se puede aprobar, la revisión se
 * quedaba trabada (SUPLYMATEC: 102 de 113 renglones sin coincidencia).
 *
 * Ahora se mira al revés: qué parte del nombre del CATÁLOGO aparece en la
 * cotización (cobertura). El catálogo suele ser el nombre corto y la
 * cotización el largo, con marca, color y relleno.
 */
import { normalizeMaterialName } from './price-selection';

/** Palabras que dicen lo mismo en cotizaciones dominicanas. */
const SINONIMOS: Record<string, string> = {
  alambre: 'cable',
  conductor: 'cable',
  cables: 'cable',
  alambres: 'cable',
  tuberia: 'tubo',
  tubos: 'tubo',
  conduit: 'tubo',
  plancha: 'panel',
  planchas: 'panel',
  lamina: 'panel',
  densglass: 'dens-glass',
  sheetrock: 'yeso',
  gypsum: 'yeso',
  perfil: 'paral',
  parales: 'paral',
  travesal: 'canal',
  canales: 'canal',
  fundas: 'funda',
  tornillos: 'tornillo',
  breakers: 'breaker',
  interruptores: 'interruptor',
  tomacorrientes: 'tomacorriente',
  cajas: 'caja',
};

/** Relleno que no distingue un material de otro: colores, conectores, "o similar"... */
const RUIDO = new Set([
  'st', 'de', 'del', 'la', 'el', 'los', 'las', 'con', 'para', 'por', 'y', 'o', 'x', 'en', 'a',
  'similar', 'tipo', 'marca', 'modelo', 'und', 'ud', 'unidad', 'pza', 'pieza', 'pieces',
  'negro', 'blanco', 'rojo', 'verde', 'azul', 'amarillo', 'gris', 'color',
]);

/** Tokens significativos de un nombre: normalizados, con sinónimos y sin relleno. */
export function tokens(raw: string): string[] {
  const out: string[] = [];
  for (let t of normalizeMaterialName(raw).split(' ')) {
    t = t.replace(/^[.\-/]+|[.\-/]+$/g, ''); // puntuación suelta en los bordes
    if (t.startsWith('#')) t = t.slice(1); // "#12" y "12" son el mismo calibre
    if (!t || RUIDO.has(t)) continue;
    const conDigito = /\d/.test(t);
    if (!conDigito) t = t.replace(/\./g, ''); // "G.E." = "GE"; en medidas el punto sí importa ("1.5")
    if (!conDigito && t.length < 3) continue; // "ge", "pa"... salvo medidas ("12", "4x8")
    out.push(SINONIMOS[t] ?? t);
  }
  return [...new Set(out)];
}

/** Qué fracción de los tokens del candidato aparece en la cotización (0 a 1). */
export function cobertura(consulta: string[], candidato: string[]): number {
  if (candidato.length === 0) return 0;
  const q = new Set(consulta);
  return candidato.filter((t) => q.has(t)).length / candidato.length;
}

export interface Candidato<T> {
  item: T;
  score: number;
}

/**
 * Candidatos ordenados de mejor a peor (solo los que cubren al menos la mitad
 * de su nombre). Si una medida del candidato ("#12", "1/2", "4x8") NO está en
 * la cotización, no se propone: "Cable #10" jamás es sugerencia de un "#12".
 */
export function rankear<T extends { name: string }>(descripcion: string, catalogo: T[], min = 0.5): Candidato<T>[] {
  const q = tokens(descripcion);
  const qSet = new Set(q);
  const out: Candidato<T>[] = [];
  for (const item of catalogo) {
    const c = tokens(item.name);
    const medidas = c.filter((t) => /\d/.test(t));
    if (medidas.some((m) => !qSet.has(m))) continue;
    // Tiene que coincidir QUÉ es (una palabra), no solo un número: "TUBO ... X 10"
    // no es un "Cable #10" aunque los dos digan 10.
    if (!c.some((t) => !/\d/.test(t) && qSet.has(t))) continue;
    const score = cobertura(q, c);
    if (score >= min) out.push({ item, score: Math.round(score * 100) / 100 });
  }
  return out.sort((a, b) => b.score - a.score || tokens(b.item.name).length - tokens(a.item.name).length);
}

/**
 * El material que se puede asignar SOLO, sin preguntar: uno con cobertura
 * completa, de al menos dos tokens (un "Cable" a secas encajaría con todo) y
 * sin empate. Con duda se devuelve null y decide la persona en la revisión.
 */
export function asignacionSegura<T extends { name: string }>(ranking: Candidato<T>[]): T | null {
  const completos = ranking.filter((c) => c.score === 1 && tokens(c.item.name).length >= 2);
  if (completos.length === 0) return null;
  const maxTokens = Math.max(...completos.map((c) => tokens(c.item.name).length));
  const mejores = completos.filter((c) => tokens(c.item.name).length === maxTokens);
  return mejores.length === 1 ? mejores[0].item : null;
}
