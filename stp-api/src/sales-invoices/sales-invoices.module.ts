import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesInvoice } from './entities/sales-invoice.entity';
import { SalesInvoiceLine } from './entities/sales-invoice-line.entity';
import { SalesInvoicesService } from './sales-invoices.service';
import { SalesInvoicesController } from './sales-invoices.controller';
import { Client } from '../clients/entities/client.entity';
import { Project } from '../projects/entities/project.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { Payment } from '../payments/entities/payment.entity';
import { PaymentsModule } from '../payments/payments.module';
import { EcfModule } from '../ecf/ecf.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SalesInvoice, SalesInvoiceLine, Client, Project, Quote, Payment]),
    PaymentsModule,
    EcfModule,
    SettingsModule,
  ],
  providers: [SalesInvoicesService],
  controllers: [SalesInvoicesController],
  exports: [SalesInvoicesService],
})
export class SalesInvoicesModule {}
