import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchedulerService } from './scheduler.service';
import { Quote } from '../quotes/entities/quote.entity';
import { Task } from '../tasks/entities/task.entity';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([Quote, Task]),
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}
