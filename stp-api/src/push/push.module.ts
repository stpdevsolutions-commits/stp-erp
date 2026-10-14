import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushSubscription } from './entities/push-subscription.entity';
import { PushService } from './push.service';
import { PushController } from './push.controller';

/** Web Push (VAPID) de la PWA — ERP-58. */
@Module({
  imports: [TypeOrmModule.forFeature([PushSubscription])],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
