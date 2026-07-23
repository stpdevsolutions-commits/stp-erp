import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchedulerService } from './scheduler.service';
import { Quote } from '../quotes/entities/quote.entity';
import { Task } from '../tasks/entities/task.entity';
import { Payment } from '../payments/entities/payment.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { QuotesModule } from '../quotes/quotes.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([Quote, Task, Payment]),
    NotificationsModule,
    QuotesModule,
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}
