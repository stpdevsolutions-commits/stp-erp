import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { join, relative, resolve, sep } from 'path';
import { existsSync, unlink } from 'fs';
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
