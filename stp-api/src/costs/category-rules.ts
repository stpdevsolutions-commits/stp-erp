/**
 * Categoría probable de un renglón de cotización, por palabras clave.
 * Lógica pura. Se usa cuando el renglón no se parece a ningún material del
 * catálogo (si se parece, manda la categoría de ese material).
 *
 * Las reglas apuntan al CÓDIGO de la categoría (estable) y no al nombre: si
 * alguien renombra "Drywall y yeso", la regla sigue funcionando. Si el código
 * no existe en el catálogo, la regla se salta.
 *
 * El ORDEN importa: la primera regla que encaje gana. Las específicas van
 * antes que las genéricas ("PANEL LED" es iluminación, no un panel eléctrico;
 * "ALAMBRE DE AMARRE" es acero, no un cable; "TAPE FIBRA VIDRIO" es drywall,
 * no fibra óptica).
 */
import { normalizeMaterialName } from './price-selection';

interface Regla {
  code: string;
  re: RegExp;
}

const REGLAS: Regla[] = [
  // Iluminación primero: "Luminaria plafón 2x2 LED" es una luminaria y "panel led" no es un
  // panel eléctrico.
  { code: 'ILU', re: /\bluminari|\blampara|\bbombillo|\bfoco\b|\breflector|\bled\b|\bspot ?light|\bdownlight/ },
  // Redes antes que protecciones y cables ("patch panel", "cable UTP", "organizador 1U").
  { code: 'RED', re: /\butp\b|\bcat ?[56]|\brj-?45|\bpatch|\bfibra optica|\bjack\b|\bswitch de red|\brack\b|\borganizador|\b\d+ ?u\b|\bface ?plate|\bbandeja ventilada/ },
  // Plafón (antes que drywall: "panel de plafón").
  { code: 'PLA', re: /\bplafon|\bmain ?tee|\bcross ?tee|\bangulo perimetral|\bcielo ?(falso|raso)/ },
  // Puesta a tierra antes que acero ("varilla de tierra").
  { code: 'TIE', re: /^(?!.*\b(toma|tomacorriente|interruptor|receptaculo)\b).*(?:\btierra\b|\bground|\bcopperweld|\bvarilla cooper|\bbarra de tierra)/ },
  // Acero antes que cables ("alambre de amarre").
  { code: 'ACE', re: /\bvarilla|\bmalla (electro|soldada)|\balambre (dulce|de amarre|galvanizado)|\bacero\b|\bperfil (c|z)\b/ },
  // Tornillería antes que drywall ("TORNILLO P/PLANCHA" es un tornillo, no una plancha).
  { code: 'FIJ', re: /\btornillo|\bpin\b|\bfulminante|\bclavo|\bancla|\btaco\b|\btarugo|\bperno|\barandela|\bremache|\bexpansion\b/ },
  {
    code: 'DRY',
    re: /\bdens-?glass|\bsheet ?rock|\bgypsum|\byeso\b|\bdrywall|\bplancha|\bparal|\bperfil|\btravesal|\bcanal (metalic|galvaniz|u)|\besquinero|\bmasilla|\bcementin|\bbase ?coat|\b(tape|cinta) (fibra|de papel|papel|malla|para juntas)|\bmegamaster/,
  },
  { code: 'PIS', re: /\bceramic|\bporcelanato|\bporcelana|\bzocalo|\bpegamento (para )?(piso|ceramic)|\bpiso\b|\bcruceta/ },
  { code: 'CEM', re: /\bcemento\b|\barena\b|\bgrava|\bgravilla|\bblock|\bbloque|\bmortero|\bhormigon|\bpega ?block/ },
  { code: 'PIN', re: /\bpintura|\bsellador|\bprimer\b|\besmalte|\bimpermeabiliz|\bbarniz|\bthinner/ },
  { code: 'MAD', re: /\bmadera|\bpino\b|\bplywood|\bplaywood|\bmdf\b|\btabla\b|\bcuarton/ },
  // Eléctrico genérico.
  { code: 'PRO', re: /\bbreaker|\bdisyuntor|\bcentro de carga|\bpanel (electric|de distribucion|\d)|\bgabinete|\btransfer|\bsupresor/ },
  { code: 'CJA', re: /\bcaja|\bregistro\b|\boctagonal|\bcajetin|\bcondulet|\bletra (lb|ll|lr|t|c)\b/ },
  { code: 'DIS', re: /\btoma(corriente)?\b|\binterruptor|\bswitch\b|\bdimmer|\bplaca\b|\btapa\b|\benchufe|\bclavija/ },
  { code: 'CAB', re: /\bcable|\balambre|\bthhn|\bthw\b|\bconductor|\bcordon|\bawg\b|\bcinta aislante/ },
  { code: 'TUB', re: /\btubo|\btuberia|\bemt\b|\bconduit|\bcodo\b|\bcurva|\bunion\b|\bconector|\babrazadera|\bcoupling|\bniple|\bpvc\b/ },
];

export interface CategoriaRef {
  id: string;
  code: string;
}

/** La categoría que corresponde a la descripción, o null si ninguna regla encaja. */
export function categoriaPorReglas<T extends CategoriaRef>(descripcion: string, categorias: T[]): T | null {
  const texto = normalizeMaterialName(descripcion);
  const porCodigo = new Map(categorias.map((c) => [c.code.toUpperCase(), c]));
  for (const r of REGLAS) {
    const cat = porCodigo.get(r.code);
    if (cat && r.re.test(texto)) return cat;
  }
  return null;
}

/**
 * Categorías de construcción que las reglas saben reconocer y que el catálogo
 * (que nació solo eléctrico) puede no tener todavía.
 */
export const CATEGORIAS_CONSTRUCCION: { code: string; name: string }[] = [
  { code: 'DRY', name: 'Drywall y yeso' },
  { code: 'FIJ', name: 'Tornillería y fijaciones' },
  { code: 'CEM', name: 'Cemento y agregados' },
  { code: 'ACE', name: 'Acero y varillas' },
  { code: 'PIN', name: 'Pinturas y selladores' },
  { code: 'MAD', name: 'Madera' },
  { code: 'PLA', name: 'Plafones' },
  { code: 'PIS', name: 'Pisos y cerámica' },
];
