import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { join, relative } from 'path';
import { existsSync, unlink } from 'fs';
import { FileUpload, FileContext } from './entities/file-upload.entity';
import { getUploadRoot } from './files.utils';
import { QueryFilesDto } from './dto/query-files.dto';

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(FileUpload)
    private readonly repo: Repository<FileUpload>,
  ) {}

  async saveRecord(
    file: Express.Multer.File,
    context: FileContext,
    clientId: string,
    projectId: string | null,
    uploadedById: string,
  ): Promise<FileUpload> {
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
    const absolutePath = join(getUploadRoot(), record.path);
    return { absolutePath, record };
  }

  async remove(id: string): Promise<void> {
    const record = await this.findOne(id);
    const absolutePath = join(getUploadRoot(), record.path);

    await this.repo.remove(record);

    if (existsSync(absolutePath)) {
      unlink(absolutePath, () => undefined);
    }
  }
}
