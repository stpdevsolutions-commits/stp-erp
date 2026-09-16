import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sprint } from './entities/sprint.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { Project } from '../projects/entities/project.entity';
import { SprintsService } from './sprints.service';
import { SprintsController } from './sprints.controller';
import { NotifyService } from '../notify.service';

@Module({
  imports: [TypeOrmModule.forFeature([Sprint, Ticket, Project])],
  providers: [SprintsService, NotifyService],
  controllers: [SprintsController],
})
export class SprintsModule {}
