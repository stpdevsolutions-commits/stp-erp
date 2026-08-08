import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { extname, join, relative, resolve, sep } from 'path';
import { existsSync, mkdirSync, unlink, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { FileUpload, FileContext } from './entities/file-upload.entity';
import { getUploadRoot, validateFileMagicBytes } from './files.utils';
import { QueryFilesDto } from './dto/query-files.dto';
import { ProjectsService } from '../projects/projects.service';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    @InjectRepository(FileUpload)
    private readonly repo: Repository<FileUpload>,
    private readonly projectsService: ProjectsService,
  ) {}

  async saveRecord(
    file: Express.Multer.File,
    context: FileContext,
    clientId: string,
    projectId: string | null,
    uploadedById: string,
  ): Promise<FileUpload> {
    // P-1: validate project belongs to client before persisting
    if (projectId) {
      await this.projectsService.assertProjectBelongsToClient(projectId, clientId);
    }

    // P-2: validate magic bytes match declared MIME type
    if (!validateFileMagicBytes(file.path, file.mimetype)) {
      unlink(file.path, () => undefined);
      throw new BadRequestException(
        'File content does not match declared type. Only PDF, JPG, PNG, and WEBP are accepted.',
      );
    }

    const root = getUploadRoot();
    const relativePath = relative(root, file.path);

    const record = this.repo.create({
      originalName: file.originalname,
      filename: file.filename,
      path: relativePath,
      mimetype: file.mimetype,
      size: file.size,
      context,
      clientId,
      projectId: projectId ?? undefined,
      uploadedById,
    });

    return this.repo.save(record);
  }

  /**
   * Archiva un documento que ha generado el propio ERP (hoy: el PDF de un
   * informe de proyecto) como un archivo más del proyecto.
   *
   * No pasa por multer porque no viene de una petición `multipart`: llega como
   * buffer ya montado. Aun así termina exactamente igual que una subida normal
   * —mismo árbol en disco, misma fila en `uploaded_files`— y eso es lo que hace
   * que aparezca solo en la pantalla de Archivos y en Nextcloud, sin que el
   * sync tenga que saber nada de informes.
   *
   * `displayName` es el nombre con el que se verá (columna `originalName`, que
   * es la que usa el sync para nombrar el hard link). En disco se guarda con un
   * UUID, igual que el resto: dos informes archivados el mismo día no pueden
   * pisarse aunque se llamen igual.
   */
  async saveGeneratedFile(params: {
    buffer: Buffer;
    displayName: string;
    mimetype: string;
    context: FileContext;
    clientId: string;
    projectId: string;
    uploadedById: string;
  }): Promise<FileUpload> {
    const { buffer, displayName, mimetype, context, clientId, projectId, uploadedById } = params;

    await this.projectsService.assertProjectBelongsToClient(projectId, clientId);

    // Misma carpeta que usaría multer para este contexto.
    const dir = join(getUploadRoot(), 'clients', clientId, 'projects', projectId, 'reports');
    mkdirSync(dir, { recursive: true });

    const filename = `${randomUUID()}${extname(displayName).toLowerCase() || '.pdf'}`;
    const absolutePath = join(dir, filename);
    writeFileSync(absolutePath, buffer);

    // El PDF lo genera el servidor, así que esto no defiende de un cliente
    // hostil: es una red de seguridad contra archivar un buffer corrupto o
    // vacío, que sería peor que no archivar nada.
    if (!validateFileMagicBytes(absolutePath, mimetype)) {
      unlink(absolutePath, () => undefined);
      throw new BadRequestException('El documento generado no es un archivo válido');
    }

    const record = this.repo.create({
      originalName: displayName,
      filename,
      path: relative(getUploadRoot(), absolutePath),
      mimetype,
      size: buffer.length,
      context,
      clientId,
      projectId,
      uploadedById,
    });

    return this.repo.save(record);
  }

  async saveProjectPhotoForFicha(
    file: Express.Multer.File,
    projectId: string,
    uploadedById: string,
  ): Promise<{ id: string; url: string }> {
    const project = await this.projectsService.findOne(projectId);
    const saved = await this.saveRecord(file, FileContext.PROJECT_PHOTOS, project.clientId, projectId, uploadedById);
    return { id: saved.id, url: `/files/${saved.id}/download` };
  }

  findByClient(clientId: string, query: QueryFilesDto): Promise<FileUpload[]> {
    const where: any = { clientId };
    if (query.context) where.context = query.context;
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  findByProject(clientId: string, projectId: string, query: QueryFilesDto): Promise<FileUpload[]> {
    const where: any = { clientId, projectId };
    if (query.context) where.context = query.context;
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<FileUpload> {
    const record = await this.repo.findOne({ where: { id } });
    if (!record) throw new NotFoundException('Archivo no encontrado');
    return record;
  }

  async getAbsolutePath(id: string): Promise<{ absolutePath: string; record: FileUpload }> {
    const record = await this.findOne(id);
    const uploadRoot = resolve(getUploadRoot());
    const absolutePath = resolve(join(getUploadRoot(), record.path));

    // P-3: prevent path traversal — ensure resolved path stays within upload root
    if (!absolutePath.startsWith(uploadRoot + sep)) {
      throw new NotFoundException('File not found');
    }

    return { absolutePath, record };
  }

  async remove(id: string): Promise<void> {
    const record = await this.findOne(id);
    const absolutePath = join(getUploadRoot(), record.path);

    await this.repo.remove(record);

    if (existsSync(absolutePath)) {
      unlink(absolutePath, (err) => {
        if (err) this.logger.error(`Failed to delete file ${absolutePath}: ${err.message}`);
      });
    }
  }
}
