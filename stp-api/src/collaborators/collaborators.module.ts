import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Collaborator } from './entities/collaborator.entity';
import { CollaboratorsService } from './collaborators.service';
import { CollaboratorsController } from './collaborators.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Collaborator])],
  providers: [CollaboratorsService],
  controllers: [CollaboratorsController],
  exports: [CollaboratorsService],
})
export class CollaboratorsModule {}
