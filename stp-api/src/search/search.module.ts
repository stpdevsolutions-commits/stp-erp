import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../clients/entities/client.entity';
import { Project } from '../projects/entities/project.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { Task } from '../tasks/entities/task.entity';
import { FileUpload } from '../files/entities/file-upload.entity';
import { Collaborator } from '../collaborators/entities/collaborator.entity';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Client, Project, Quote, Task, FileUpload, Collaborator]),
  ],
  providers: [SearchService],
  controllers: [SearchController],
})
export class SearchModule {}
