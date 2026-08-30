import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsModule } from './projects/projects.module';
import { TicketsModule } from './tickets/tickets.module';
import { Project } from './projects/entities/project.entity';
import { Ticket } from './tickets/entities/ticket.entity';
import { HealthController } from './common/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'stp-postgres'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get('DB_USER', 'stp_user'),
        password: config.get('DB_PASS'),
        database: config.get('DB_NAME', 'tickets_db'),
        entities: [Project, Ticket],
        synchronize: true,
      }),
    }),
    ProjectsModule,
    TicketsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
