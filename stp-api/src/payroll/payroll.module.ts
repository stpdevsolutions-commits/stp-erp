import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayrollEntry } from './entities/payroll-entry.entity';
import { Collaborator } from '../collaborators/entities/collaborator.entity';
import { Project } from '../projects/entities/project.entity';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';
import { ExpensesModule } from '../expenses/expenses.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PayrollEntry, Collaborator, Project]),
    // Para imputar la mano de obra como gasto del proyecto. La dependencia va en
    // un solo sentido (nómina → gastos), así que no hay ciclo de módulos.
    ExpensesModule,
  ],
  providers: [PayrollService],
  controllers: [PayrollController],
  exports: [PayrollService],
})
export class PayrollModule {}
