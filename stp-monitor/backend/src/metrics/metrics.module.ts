import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { ThresholdService } from './threshold.service';
import { AlertsModule } from '../alerts/alerts.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AlertsModule, NotificationsModule],
  providers: [MetricsService, ThresholdService],
  controllers: [MetricsController],
  exports: [MetricsService],
})
export class MetricsModule {}
