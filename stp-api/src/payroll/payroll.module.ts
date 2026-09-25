import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayrollEntry } from './entities/payroll-entry.entity';
import { CollaboratorLoan } from './entities/collaborator-loan.entity';
import { Collaborator } from '../collaborators/entities/collaborator.entity';
import { Project } from '../projects/entities/project.entity';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';
import { CollaboratorLoansService } from './collaborator-loans.service';
import { CollaboratorLoansController } from './collaborator-loans.controller';
import { ExpensesModule } from '../expenses/expenses.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PayrollEntry, CollaboratorLoan, Collaborator, Project]),
    // Para imputar la mano de obra como gasto del proyecto. La dependencia va en
    // un solo sentido (nómina → gastos), así que no hay ciclo de módulos.
    ExpensesModule,
    // Los datos de la empresa (nombre, RNC, logo) que encabezan el recibo.
    SettingsModule,
  ],
  providers: [PayrollService, CollaboratorLoansService],
  // CollaboratorLoansController PRIMERO: registra rutas /payroll/loans, y Nest
  // resuelve por orden de registro, no por especificidad — si PayrollController
  // fuera primero, su GET /payroll/:id capturaría /payroll/loans con id="loans"
  // (ParseUUIDPipe lo rechazaría con 400). Mismo motivo que 'summary' antes de
  // ':id' dentro de PayrollController, pero aquí entre controladores.
  controllers: [CollaboratorLoansController, PayrollController],
  exports: [PayrollService, CollaboratorLoansService],
})
export class PayrollModule {}
