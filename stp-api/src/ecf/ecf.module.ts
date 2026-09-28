import { Module } from '@nestjs/common';
import { EcfClientService } from './ecf-client.service';

/**
 * Integración con eCF-SaaS (ecf-api). Expone `EcfClientService` para que otros
 * módulos del ERP (Pagos) puedan emitir comprobantes fiscales electrónicos.
 */
@Module({
  providers: [EcfClientService],
  exports: [EcfClientService],
})
export class EcfModule {}
