import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Expense } from './entities/expense.entity';
import { Project } from '../projects/entities/project.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { FileUpload } from '../files/entities/file-upload.entity';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [TypeOrmModule.forFeature([Expense, Project, Supplier, FileUpload]), SettingsModule],
  providers: [ExpensesService],
  controllers: [ExpensesController],
  exports: [ExpensesService],
})
export class ExpensesModule {}
