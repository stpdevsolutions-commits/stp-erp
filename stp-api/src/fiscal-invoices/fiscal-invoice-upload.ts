import { BadRequestException } from '@nestjs/common';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { diskStorage, memoryStorage } from 'multer';
import { SCAN_MAX_BYTES, SCAN_MIME_TYPES } from './invoice-scan';
import { ALLOWED_MIMETYPES, MAX_FILE_SIZE, getUploadRoot } from '../files/files.utils';
import { todayRD } from '../common/dates';

/**
 * Dónde y cómo se guarda la foto de una factura fiscal: `fiscal-invoices/<año>/<uuid>.<ext>`
 * bajo la raíz de subidas. No cuelga de un cliente ni de un proyecto (una factura puede
 * ser un gasto general), por eso no usa la tabla `uploaded_files`.
 */
export const fiscalInvoicePhotoOpts = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      const dir = join(getUploadRoot(), 'fiscal-invoices', todayRD().slice(0, 4));
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) =>
      cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
  }),
  fileFilter: (_req: unknown, file: Express.Multer.File, cb: (e: Error | null, ok: boolean) => void) => {
    if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
      cb(new BadRequestException('Tipo de archivo no permitido. Se permiten: PDF, JPG, PNG, WEBP'), false);
      return;
    }
    cb(null, true);
  },
  limits: { fileSize: MAX_FILE_SIZE },
};

/**
 * Archivo para ESCANEAR: se lee en memoria y se descarta (no se guarda). La foto se sube
 * aparte, al guardar la factura. Tope de 8 MB y solo fotos o PDF.
 */
export const invoiceScanUploadOpts = {
  storage: memoryStorage(),
  fileFilter: (_req: unknown, file: Express.Multer.File, cb: (e: Error | null, ok: boolean) => void) => {
    if (!(SCAN_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      cb(new BadRequestException('Tipo de archivo no permitido. Se permiten: JPG, PNG, WEBP y PDF'), false);
      return;
    }
    cb(null, true);
  },
  limits: { fileSize: SCAN_MAX_BYTES },
};
