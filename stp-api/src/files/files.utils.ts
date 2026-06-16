import { extname, join } from 'path';
import { mkdirSync, openSync, readSync, closeSync } from 'fs';
import { randomUUID } from 'crypto';
import { diskStorage } from 'multer';

export const ALLOWED_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export function getUploadRoot(): string {
  return process.env.UPLOAD_PATH ?? '/app/uploads';
}

function makeStorage(destFn: (req: any) => string) {
  return diskStorage({
    destination: (req, _file, cb) => {
      const dir = destFn(req);
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) =>
      cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
  });
}

function fileFilter(_req: any, file: Express.Multer.File, cb: any) {
  if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
    cb(new Error('Tipo de archivo no permitido. Se permiten: PDF, JPG, PNG, WEBP'), false);
    return;
  }
  cb(null, true);
}

function opts(destFn: (req: any) => string) {
  return { storage: makeStorage(destFn), fileFilter, limits: { fileSize: MAX_FILE_SIZE } };
}

export const clientProfileOpts = opts(
  (req) => join(getUploadRoot(), 'clients', req.params.clientId, 'profile'),
);

export const clientQuotesOpts = opts(
  (req) => join(getUploadRoot(), 'clients', req.params.clientId, 'quotes'),
);

export const projectPhotosOpts = opts(
  (req) =>
    join(getUploadRoot(), 'clients', req.params.clientId, 'projects', req.params.projectId, 'photos'),
);

export const projectDocumentsOpts = opts(
  (req) =>
    join(getUploadRoot(), 'clients', req.params.clientId, 'projects', req.params.projectId, 'documents'),
);

export const projectExpensesOpts = opts(
  (req) =>
    join(getUploadRoot(), 'clients', req.params.clientId, 'projects', req.params.projectId, 'expenses'),
);

export const projectQuotesOpts = opts(
  (req) =>
    join(getUploadRoot(), 'clients', req.params.clientId, 'projects', req.params.projectId, 'quotes'),
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

export const FILE_UPLOAD_BODY = {
  schema: {
    type: 'object' as const,
    required: ['file'],
    properties: {
      file: { type: 'string', format: 'binary' },
    },
  },
};
