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
import { PayrollEntry } from '../payroll/entities/payroll-entry.entity';
import { ReportsService } from './reports.service';
import { GeneralReportService } from './general-report.service';
import { ReportsController } from './reports.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Client,
      Project,
      Task,
      Quote,
      Expense,
      Payment,
      Ficha,
      Collaborator,
      // Solo para el reporte general, y solo se consulta para MANAGER+.
      PayrollEntry,
    ]),
    // Datos de la empresa para encabezar los reportes exportados a PDF.
    SettingsModule,
  ],
  providers: [ReportsService, GeneralReportService],
  controllers: [ReportsController],
})
export class ReportsModule {}
