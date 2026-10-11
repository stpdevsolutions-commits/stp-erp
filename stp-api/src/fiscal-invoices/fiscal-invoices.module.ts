import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FiscalInvoice } from './entities/fiscal-invoice.entity';
import { FiscalInvoicesService } from './fiscal-invoices.service';
import { FiscalInvoicesController } from './fiscal-invoices.controller';
import { InvoiceScanService } from './invoice-scan.service';
import { DgiiModule } from '../dgii/dgii.module';
import { SettingsModule } from '../settings/settings.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Expense } from '../expenses/entities/expense.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FiscalInvoice, Supplier, Expense]), DgiiModule, SettingsModule, ExpensesModule],
  providers: [FiscalInvoicesService, InvoiceScanService],
  controllers: [FiscalInvoicesController],
  exports: [FiscalInvoicesService],
})
export class FiscalInvoicesModule {}
