import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from './entities/ticket.entity';
import { TicketComment } from './entities/ticket-comment.entity';
import { Project } from '../projects/entities/project.entity';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { NotifyService } from '../notify.service';

@Module({
  imports: [TypeOrmModule.forFeature([Ticket, TicketComment, Project])],
  providers: [TicketsService, NotifyService],
  controllers: [TicketsController],
})
export class TicketsModule {}
