import sharp from 'sharp';
import jsQR from 'jsqr';

/** Anchos (px) a los que se prueba la foto: una foto de celular trae mucha más resolución de la útil. */
const WIDTHS = [1600, 1000, 2400, 700];

/**
 * Busca un código QR en una foto y devuelve su texto, o `null` si no hay ninguno legible.
 * Se prueba a varios tamaños porque un QR pequeño dentro de una foto grande a veces solo se lee
 * a una escala concreta. Aplica la orientación EXIF (las fotos de celular vienen "giradas").
 * Nunca lanza: un archivo ilegible simplemente no tiene QR.
 */
export async function decodeQrFromImage(buffer: Buffer): Promise<string | null> {
  const tried = new Set<number>();
  for (const width of WIDTHS) {
    try {
      const { data, info } = await sharp(buffer, { failOn: 'none' })
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      // Una foto más chica que `width` no se agranda: repetir el mismo tamaño no aporta nada.
      if (tried.has(info.width)) continue;
      tried.add(info.width);
      const found = jsQR(new Uint8ClampedArray(data), info.width, info.height, { inversionAttempts: 'attemptBoth' });
      if (found?.data) return found.data;
    } catch {
      return null;
    }
  }
  return null;
}
