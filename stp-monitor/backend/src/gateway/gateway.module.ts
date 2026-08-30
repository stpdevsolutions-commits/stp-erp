import { Module } from '@nestjs/common';
import { MonitorGateway } from './monitor.gateway';
import { MetricsModule } from '../metrics/metrics.module';
import { ServicesModule } from '../services/services.module';
import { ContainersModule } from '../containers/containers.module';
import { AlertsModule } from '../alerts/alerts.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [MetricsModule, ServicesModule, ContainersModule, AlertsModule, ProjectsModule],
  providers: [MonitorGateway],
})
export class GatewayModule {}
