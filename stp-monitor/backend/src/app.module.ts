import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetricsModule } from './metrics/metrics.module';
import { ServicesModule } from './services/services.module';
import { ContainersModule } from './containers/containers.module';
import { AlertsModule } from './alerts/alerts.module';
import { NotificationsModule } from './notifications/notifications.module';
import { GatewayModule } from './gateway/gateway.module';
import { ProjectsModule } from './projects/projects.module';
import { ServiceCheck } from './services/entities/service-check.entity';
import { Alert } from './alerts/entities/alert.entity';
import { ProjectStatus } from './projects/entities/project-status.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'stp-postgres'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get('DB_USER', 'stp_user'),
        password: config.get('DB_PASS'),
        database: config.get('DB_NAME', 'vigia_db'),
        entities: [ServiceCheck, Alert, ProjectStatus],
        synchronize: true,
      }),
    }),
    MetricsModule,
    ServicesModule,
    ContainersModule,
    AlertsModule,
    NotificationsModule,
    ProjectsModule,
    GatewayModule,
  ],
})
export class AppModule {}
