import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ClientsModule } from './clients/clients.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { QuotesModule } from './quotes/quotes.module';
import { ExpensesModule } from './expenses/expenses.module';
import { PaymentsModule } from './payments/payments.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { ReportsModule } from './reports/reports.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { FilesModule } from './files/files.module';
import { InventoryModule } from './inventory/inventory.module';
import { CollaboratorsModule } from './collaborators/collaborators.module';
import { SettingsModule } from './settings/settings.module';
import { FichasModule } from './fichas/fichas.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { Ficha } from './fichas/entities/ficha.entity';
import { FileUpload } from './files/entities/file-upload.entity';
import { InventoryItem } from './inventory/entities/inventory-item.entity';
import { Collaborator } from './collaborators/entities/collaborator.entity';
import { AppSettings } from './settings/entities/app-settings.entity';
import { RefreshToken } from './auth/entities/refresh-token.entity';
import { User } from './users/entities/user.entity';
import { Client } from './clients/entities/client.entity';
import { Project } from './projects/entities/project.entity';
import { Task } from './tasks/entities/task.entity';
import { Quote } from './quotes/entities/quote.entity';
import { QuoteItem } from './quotes/entities/quote-item.entity';
import { Expense } from './expenses/entities/expense.entity';
import { Payment } from './payments/entities/payment.entity';
import { Supplier } from './suppliers/entities/supplier.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        entities: [User, Client, Project, Task, Quote, QuoteItem, Expense, Payment, Supplier, FileUpload, RefreshToken, InventoryItem, Collaborator, AppSettings, Ficha],
        migrations: ['dist/migrations/*.js'],
        synchronize: configService.get<string>('NODE_ENV') !== 'production',
        migrationsRun: configService.get<string>('NODE_ENV') === 'production',
        logging: configService.get<string>('NODE_ENV') === 'development',
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    ClientsModule,
    ProjectsModule,
    TasksModule,
    QuotesModule,
    ExpensesModule,
    PaymentsModule,
    SuppliersModule,
    ReportsModule,
    HealthModule,
    NotificationsModule,
    FilesModule,
    InventoryModule,
    CollaboratorsModule,
    SettingsModule,
    FichasModule,
    SchedulerModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
