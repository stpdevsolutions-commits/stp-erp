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
import { GeneralReportService } from './general-report.service';
import { ReportsController } from './reports.controller';
import { ProjectReportService } from './project-report.service';
import { ProjectReportController } from './project-report.controller';
import { SettingsModule } from '../settings/settings.module';
import { FilesModule } from '../files/files.module';

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
      // Fotos de los informes de proyecto.
      FileUpload,
      // Nómina: la consultan el reporte general y el informe interno, y solo
      // para MANAGER+ (son sueldos).
      PayrollEntry,
      // Fila editable (observaciones, conclusiones) de cada informe.
      ProjectReport,
    ]),
    // Datos de la empresa para encabezar los reportes exportados a PDF.
    SettingsModule,
    // Para archivar el PDF de un informe como archivo del proyecto.
    FilesModule,
  ],
  providers: [ReportsService, GeneralReportService, ProjectReportService],
  controllers: [ReportsController, ProjectReportController],
})
export class ReportsModule {}
