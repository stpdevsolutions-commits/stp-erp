import { Module } from '@nestjs/common';
import { MonitorGateway } from './monitor.gateway';
import { MetricsModule } from '../metrics/metrics.module';
import { ServicesModule } from '../services/services.module';
import { ContainersModule } from '../containers/containers.module';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  imports: [MetricsModule, ServicesModule, ContainersModule, AlertsModule],
  providers: [MonitorGateway],
})
export class GatewayModule {}
