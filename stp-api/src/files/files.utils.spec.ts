import { join } from 'path';
import {
  assertSafeUploadDir,
  clientDocumentsOpts,
  detectImageType,
  fichaProjectSegment,
  isUuid,
  projectPhotosOpts,
  fichaPhotosOpts,
  requireUuidSegment,
} from './files.utils';

const U1 = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
const U2 = '0a1b2c3d-1111-4222-8333-444455556666';
const ROOT = '/tmp/uploads-test';

describe('files.utils: rutas de subida', () => {
  beforeAll(() => {
    process.env.UPLOAD_PATH = ROOT;
  });

  it('isUuid acepta UUID y rechaza lo demás', () => {
    expect(isUuid(U1)).toBe(true);
    expect(isUuid('../../x')).toBe(false);
    expect(isUuid('misc')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(['a'])).toBe(false);
  });

  it('requireUuidSegment lanza 400 con segmentos no UUID', () => {
    expect(requireUuidSegment(U1)).toBe(U1);
    expect(() => requireUuidSegment('..')).toThrow('Ruta de archivo no válida');
    expect(() => requireUuidSegment('abc')).toThrow();
  });

  it('fichaProjectSegment: misc por defecto, UUID si viene, error si es basura', () => {
    expect(fichaProjectSegment(undefined)).toBe('misc');
    expect(fichaProjectSegment('')).toBe('misc');
    expect(fichaProjectSegment(U1)).toBe(U1);
    expect(() => fichaProjectSegment('../../x')).toThrow();
  });

  it('assertSafeUploadDir acepta rutas legítimas dentro de la raíz', () => {
    const dir = join(ROOT, 'clients', U1, 'projects', U2, 'photos');
    expect(assertSafeUploadDir(dir, ROOT)).toContain(U2);
    expect(() => assertSafeUploadDir(join(ROOT, 'fichas', 'misc', 'photos'), ROOT)).not.toThrow();
  });

  it('assertSafeUploadDir rechaza .. y rutas fuera de la raíz', () => {
    expect(() => assertSafeUploadDir(join(ROOT, 'fichas', '..', '..', 'etc'), ROOT)).toThrow(
      'Ruta de archivo no válida',
    );
    expect(() => assertSafeUploadDir('/etc', ROOT)).toThrow();
    expect(() => assertSafeUploadDir(ROOT, ROOT)).toThrow();
    expect(() => assertSafeUploadDir(`${ROOT}-otro/x`, ROOT)).toThrow();
  });

  it('assertSafeUploadDir rechaza segmentos con puntos o caracteres raros', () => {
    expect(() => assertSafeUploadDir(join(ROOT, 'a.b'), ROOT)).toThrow();
    expect(() => assertSafeUploadDir(join(ROOT, 'a b'), ROOT)).toThrow();
  });

  function destination(opts: any, req: any): Promise<{ err: any; dir: string }> {
    return new Promise((resolveP) => {
      opts.storage.getDestination(req, {}, (err: any, dir: string) => resolveP({ err, dir }));
    });
  }

  it('el destination de multer rechaza ?projectId=../../x en fichas', async () => {
    const r = await destination(fichaPhotosOpts, { query: { projectId: '../../x' }, params: {} });
    expect(r.err).toBeTruthy();
    expect(r.dir).toBe('');
  });

  it('el destination rechaza clientId no UUID', async () => {
    const r = await destination(clientDocumentsOpts, { params: { clientId: '..' }, query: {} });
    expect(r.err).toBeTruthy();
    const r2 = await destination(projectPhotosOpts, { params: { clientId: U1, projectId: 'x/../y' }, query: {} });
    expect(r2.err).toBeTruthy();
  });
});

describe('detectImageType', () => {
  it('detecta PNG, JPEG y WEBP; rechaza lo demás', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
    expect(detectImageType(png)?.ext).toBe('.png');
    expect(detectImageType(jpg)?.mime).toBe('image/jpeg');
    expect(detectImageType(webp)?.ext).toBe('.webp');
    expect(detectImageType(Buffer.from('<svg xmlns="x"></svg>'))).toBeNull();
    expect(detectImageType(undefined)).toBeNull();
  });
});
