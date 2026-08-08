import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { FileUpload } from './entities/file-upload.entity';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [TypeOrmModule.forFeature([FileUpload]), ProjectsModule],
  controllers: [FilesController],
  providers: [FilesService],
  // ReportsModule lo usa para archivar el PDF de un informe como archivo del proyecto.
  exports: [FilesService],
})
export class FilesModule {}
