import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FiscalInvoice } from './entities/fiscal-invoice.entity';
import { FiscalInvoiceSplit } from './entities/fiscal-invoice-split.entity';
import { FiscalInvoicesService } from './fiscal-invoices.service';
import { FiscalInvoicesController } from './fiscal-invoices.controller';
import { InvoiceScanService } from './invoice-scan.service';
import { DgiiModule } from '../dgii/dgii.module';
import { SettingsModule } from '../settings/settings.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Expense } from '../expenses/entities/expense.entity';
import { User } from '../users/entities/user.entity';
import { Project } from '../projects/entities/project.entity';
import { WhatsappInvoiceFlowService } from './whatsapp-invoice-flow.service';

@Module({
  imports: [TypeOrmModule.forFeature([FiscalInvoice, FiscalInvoiceSplit, Supplier, Expense, User, Project]), DgiiModule, SettingsModule, ExpensesModule],
  providers: [FiscalInvoicesService, InvoiceScanService, WhatsappInvoiceFlowService],
  controllers: [FiscalInvoicesController],
  exports: [FiscalInvoicesService],
})
export class FiscalInvoicesModule {}
