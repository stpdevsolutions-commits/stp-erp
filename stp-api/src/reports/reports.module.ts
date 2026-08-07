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
import { FileUpload } from '../files/entities/file-upload.entity';
import { PayrollEntry } from '../payroll/entities/payroll-entry.entity';
import { ProjectReport } from './entities/project-report.entity';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { ProjectReportService } from './project-report.service';
import { ProjectReportController } from './project-report.controller';
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
      // Informes de proyecto: fotos (uploaded_files), nómina imputada y la fila
      // editable de cada informe.
      FileUpload,
      PayrollEntry,
      ProjectReport,
    ]),
    // Datos de la empresa para encabezar los reportes exportados a PDF.
    SettingsModule,
  ],
  providers: [ReportsService, ProjectReportService],
  controllers: [ReportsController, ProjectReportController],
})
export class ReportsModule {}
