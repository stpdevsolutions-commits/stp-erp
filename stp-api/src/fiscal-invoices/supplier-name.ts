/**
 * Un mismo proveedor sale escrito de varias formas según la factura o la foto ("CIELOS ACUSTICOS, SRL"
 * / "Cielos Acústicos, SRL"). Aquí se decide cuál nombre usar para que siempre quede el mismo.
 */

/** Para comparar nombres: sin tildes, sin mayúsculas, sin puntuación ni espacios de más. */
export function foldName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Qué tan "bien escrito" está: las tildes pesan más que las mayúsculas sostenidas. */
function quality(name: string): number {
  const accents = (name.normalize('NFD').match(/[̀-ͯ]/g) ?? []).length;
  const hasLower = /[a-záéíóúñü]/.test(name);
  const hasUpper = /[A-ZÁÉÍÓÚÑÜ]/.test(name);
  return accents * 10 + (hasLower ? 5 : 0) + (hasLower && hasUpper ? 1 : 0);
}

/**
 * Nombre a usar para un proveedor. `known` son los nombres que el ERP ya tiene de él (primero el de
 * su ficha, luego los de facturas anteriores). Si lo leído es el mismo nombre con otra escritura,
 * gana la mejor (con tildes y mayúsculas y minúsculas) y, a igualdad, la que el ERP ya tenía. Si
 * lo leído es un nombre distinto, se respeta tal cual: el proveedor pudo cambiar de razón social.
 */
export function chooseSupplierName(scanned: string, known: string[]): string {
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
  const read = clean(scanned ?? '');
  const prior = known.map(clean).filter(Boolean);
  if (!read) return prior[0] ?? '';

  const key = foldName(read);
  const same = [...prior.filter((n) => foldName(n) === key), read];
  return same.reduce((best, n) => (quality(n) > quality(best) ? n : best), same[0]);
}
