import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PriceImportsService } from './price-imports.service';

export const PRICE_IMPORT_QUEUE = 'price-imports';

export interface PriceImportJob {
  importId: string;
}

/**
 * Worker de la extracción. Corre en el mismo proceso que la API pero fuera del ciclo
 * petición-respuesta: una cotización larga tarda minutos y ninguna petición HTTP
 * aguanta eso.
 *
 * La cola vive en Redis, así que un reinicio del contenedor a mitad de una extracción
 * no pierde el trabajo: al arrancar, el job vuelve a estar disponible.
 *
 * **Concurrencia 1 a propósito**: cada job manda un PDF entero a la API de Gemini, y
 * varios a la vez multiplican el gasto sin acelerar nada que a alguien le urja — los
 * lotes se revisan a mano después, no hay prisa.
 */
@Processor(PRICE_IMPORT_QUEUE, { concurrency: 1 })
export class PriceImportProcessor extends WorkerHost {
  private readonly logger = new Logger(PriceImportProcessor.name);

  constructor(private readonly imports: PriceImportsService) {
    super();
  }

  async process(job: Job<PriceImportJob>): Promise<void> {
    this.logger.log(`Extrayendo precios del lote ${job.data.importId}`);
    await this.imports.process(job.data.importId);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<PriceImportJob>, err: Error): void {
    // El motivo ya quedó en el propio lote (status failed + error); esto es para el log.
    this.logger.error(`Lote ${job?.data?.importId} falló: ${err.message}`);
  }
}
