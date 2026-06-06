import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { FileUpload } from './entities/file-upload.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FileUpload])],
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}
