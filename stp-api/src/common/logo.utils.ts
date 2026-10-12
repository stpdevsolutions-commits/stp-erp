import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { getUploadRoot } from '../files/files.utils';

/**
 * La carpeta `brand/` guarda más imágenes además del logo (p. ej. `hero.jpg`, la imagen destacada
 * de Inicio). Solo cuenta como logo un archivo llamado `logo.*`; si hay varios (se subió en otro
 * formato), gana el más reciente. Antes se tomaba "la primera imagen de la carpeta" y el PDF
 * mostraba la imagen destacada en lugar del logo.
 */
function logoIn(dir: string): string | null {
  try {
    if (!existsSync(dir)) return null;
    const files = readdirSync(dir)
      .filter((f) => /^logo\.(png|jpg|jpeg|webp)$/i.test(f))
      .map((f) => ({ path: join(dir, f), mtime: statSync(join(dir, f)).mtimeMs }))
      .sort((x, y) => y.mtime - x.mtime);
    return files.length ? files[0].path : null;
  } catch {
    return null;
  }
}

/** Primera imagen de una carpeta de recursos propios del código (no la de subidas). */
function firstImageIn(dir: string): string | null {
  try {
    if (!existsSync(dir)) return null;
    const files = readdirSync(dir).filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f));
    return files.length ? join(dir, files[0]) : null;
  } catch {
    return null;
  }
}

export function findLogoPath(): string | null {
  // 1. uploads/brand/logo.* — user-uploadable override
  const brandDir = join(getUploadRoot(), 'brand');
  const brandLogo = logoIn(brandDir);
  if (brandLogo) return brandLogo;

  // 2. dist/assets/ — copied by NestJS CLI assets option on production build
  const distAssets = join(__dirname, '..', 'assets');
  const distLogo = firstImageIn(distAssets);
  if (distLogo) return distLogo;

  // 3. src/assets/ — available in dev via bind-mounted source volume
  const srcAssets = join(__dirname, '..', '..', 'src', 'assets');
  return firstImageIn(srcAssets);
}
