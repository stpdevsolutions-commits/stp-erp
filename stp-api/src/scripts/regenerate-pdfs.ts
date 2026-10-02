/**
 * Rehace TODOS los PDF guardados de cotizaciones y pagos con el diseño actual.
 *
 * Los PDF de cotizaciones y pagos se generan al guardar el registro y se
 * archivan; un cambio en el generador solo se veía en los registros que se
 * editaban después. Uso (dentro del contenedor):
 *
 *   node dist/scripts/regenerate-pdfs.js
 *
 * Es idempotente: reemplaza cada PDF y su registro en uploaded_files.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { QuotesService } from '../quotes/quotes.service';
import { PaymentsService } from '../payments/payments.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const quotes = app.get(QuotesService);
    const payments = app.get(PaymentsService);

    let ok = 0;
    let failed = 0;
    for (const [label, service] of [
      ['cotización', quotes],
      ['pago', payments],
    ] as const) {
      for (const id of await service.allIds()) {
        try {
          await service.regeneratePdf(id);
          ok++;
        } catch (err) {
          failed++;
          console.error(`No se pudo rehacer el PDF de ${label} ${id}: ${(err as Error).message}`);
        }
      }
    }
    console.log(`PDF rehechos: ${ok}. Con error: ${failed}.`);
  } finally {
    await app.close();
  }
}

// Sin el exit explícito el proceso queda vivo: la cola de importación de precios
// (BullMQ/Redis) deja conexiones abiertas aun después de app.close().
main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
