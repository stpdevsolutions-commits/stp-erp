import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../clients/entities/client.entity';
import { Project } from '../projects/entities/project.entity';
import { Task } from '../tasks/entities/task.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { Expense } from '../expenses/entities/expense.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Ficha } from '../fichas/entities/ficha.entity';
import { Collaborator } from '../collaborators/entities/collaborator.entity';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Client, Project, Task, Quote, Expense, Payment, Ficha, Collaborator])],
  providers: [ReportsService],
  controllers: [ReportsController],
})
export class ReportsModule {}
