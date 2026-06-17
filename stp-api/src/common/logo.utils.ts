import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { getUploadRoot } from '../files/files.utils';

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
  const brandLogo = firstImageIn(brandDir);
  if (brandLogo) return brandLogo;

  // 2. dist/assets/ — copied by NestJS CLI assets option on production build
  const distAssets = join(__dirname, '..', 'assets');
  const distLogo = firstImageIn(distAssets);
  if (distLogo) return distLogo;

  // 3. src/assets/ — available in dev via bind-mounted source volume
  const srcAssets = join(__dirname, '..', '..', 'src', 'assets');
  return firstImageIn(srcAssets);
}
