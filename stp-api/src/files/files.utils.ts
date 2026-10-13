import { extname, join, relative, resolve, isAbsolute, sep } from 'path';
import { mkdirSync, openSync, readSync, closeSync } from 'fs';
import { randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import { BadRequestException } from '@nestjs/common';

export const ALLOWED_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export function getUploadRoot(): string {
  return process.env.UPLOAD_PATH ?? '/app/uploads';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEGMENT_RE = /^[A-Za-z0-9_-]+$/;
const INVALID_PATH_MSG = 'Ruta de archivo no válida';

/** true si el valor es un UUID (cualquier versión). */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Devuelve el UUID o lanza 400. Para ids que acaban formando parte de una ruta. */
export function requireUuidSegment(value: unknown): string {
  if (!isUuid(value)) throw new BadRequestException(INVALID_PATH_MSG);
  return value;
}

/**
 * Comprueba que `dir` queda dentro de `root` y que cada segmento relativo
 * es [A-Za-z0-9_-]+ (sin puntos ni separadores). Devuelve el directorio resuelto.
 */
export function assertSafeUploadDir(dir: string, root: string = getUploadRoot()): string {
  const rootAbs = resolve(root);
  const dirAbs = resolve(dir);
  const rel = relative(rootAbs, dirAbs);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new BadRequestException(INVALID_PATH_MSG);
  }
  for (const segment of rel.split(sep)) {
    if (!SEGMENT_RE.test(segment)) throw new BadRequestException(INVALID_PATH_MSG);
  }
  return dirAbs;
}

function safeExt(name: string): string {
  const ext = extname(name ?? '').toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
}

function makeStorage(destFn: (req: any) => string) {
  return diskStorage({
    destination: (req, _file, cb) => {
      let dir: string;
      try {
        dir = assertSafeUploadDir(destFn(req));
      } catch (err) {
        cb(err instanceof Error ? err : new BadRequestException(INVALID_PATH_MSG), '');
        return;
      }
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) =>
      cb(null, `${randomUUID()}${safeExt(file.originalname)}`),
  });
}

function fileFilter(_req: any, file: Express.Multer.File, cb: any) {
  if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
    cb(new Error('Tipo de archivo no permitido. Se permiten: PDF, JPG, PNG, WEBP'), false);
    return;
  }
  cb(null, true);
}

/** Segmento de proyecto para fotos de ficha: UUID, o 'misc' si no viene. */
export function fichaProjectSegment(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'misc';
  return requireUuidSegment(value);
}

function opts(destFn: (req: any) => string) {
  return { storage: makeStorage(destFn), fileFilter, limits: { fileSize: MAX_FILE_SIZE } };
}

export const clientProfileOpts = opts(
  (req) => join(getUploadRoot(), 'clients', requireUuidSegment(req.params.clientId), 'profile'),
);

export const clientDocumentsOpts = opts(
  (req) => join(getUploadRoot(), 'clients', requireUuidSegment(req.params.clientId), 'documents'),
);

export const clientQuotesOpts = opts(
  (req) => join(getUploadRoot(), 'clients', requireUuidSegment(req.params.clientId), 'quotes'),
);

export const projectPhotosOpts = opts(
  (req) =>
    join(getUploadRoot(), 'clients', requireUuidSegment(req.params.clientId), 'projects', requireUuidSegment(req.params.projectId), 'photos'),
);

export const fichaPhotosOpts = opts(
  (req) =>
    join(getUploadRoot(), 'fichas', fichaProjectSegment(req.query.projectId), 'photos'),
);

export const projectDocumentsOpts = opts(
  (req) =>
    join(getUploadRoot(), 'clients', requireUuidSegment(req.params.clientId), 'projects', requireUuidSegment(req.params.projectId), 'documents'),
);

export const projectExpensesOpts = opts(
  (req) =>
    join(getUploadRoot(), 'clients', requireUuidSegment(req.params.clientId), 'projects', requireUuidSegment(req.params.projectId), 'expenses'),
);

export const projectQuotesOpts = opts(
  (req) =>
    join(getUploadRoot(), 'clients', requireUuidSegment(req.params.clientId), 'projects', requireUuidSegment(req.params.projectId), 'quotes'),
);

export const clientPaymentsOpts = opts(
  (req) => join(getUploadRoot(), 'clients', requireUuidSegment(req.params.clientId), 'payments'),
);

export const projectPaymentsOpts = opts(
  (req) =>
    join(getUploadRoot(), 'clients', requireUuidSegment(req.params.clientId), 'projects', requireUuidSegment(req.params.projectId), 'payments'),
);

/**
 * Validates file content against known magic byte signatures.
 * Guards against MIME type spoofing (Content-Type header is client-controlled).
 */
export function validateFileMagicBytes(filePath: string, declaredMime: string): boolean {
  const header = Buffer.alloc(12);
  const fd = openSync(filePath, 'r');
  try {
    readSync(fd, header, 0, 12, 0);
  } finally {
    closeSync(fd);
  }

  switch (declaredMime) {
    case 'image/jpeg':
      return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    case 'image/png':
      return (
        header[0] === 0x89 &&
        header[1] === 0x50 &&
        header[2] === 0x4e &&
        header[3] === 0x47
      );
    case 'application/pdf':
      return (
        header[0] === 0x25 &&
        header[1] === 0x50 &&
        header[2] === 0x44 &&
        header[3] === 0x46
      );
    case 'image/webp':
      return (
        header.slice(0, 4).toString('ascii') === 'RIFF' &&
        header.slice(8, 12).toString('ascii') === 'WEBP'
      );
    default:
      return false;
  }
}

/**
 * Detecta el tipo real de una imagen (JPEG/PNG/WEBP) por sus magic bytes.
 * Devuelve el mimetype y la extensión canónica, o null si no es una imagen válida.
 */
export function detectImageType(buf: Buffer | undefined): { mime: string; ext: string } | null {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: '.jpg' };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { mime: 'image/png', ext: '.png' };
  }
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { mime: 'image/webp', ext: '.webp' };
  }
  return null;
}

export const FILE_UPLOAD_BODY = {
  schema: {
    type: 'object' as const,
    required: ['file'],
    properties: {
      file: { type: 'string', format: 'binary' },
    },
  },
};
