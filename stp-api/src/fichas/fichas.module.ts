import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ficha } from './entities/ficha.entity';
import { Project } from '../projects/entities/project.entity';
import { FichasService } from './fichas.service';
import { FichasController } from './fichas.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Ficha, Project])],
  controllers: [FichasController],
  providers: [FichasService],
  exports: [FichasService],
})
export class FichasModule {}
