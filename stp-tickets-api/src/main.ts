import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ProjectsService } from './projects/projects.service';

/** Catálogo inicial — los proyectos que ya lleva STP hoy. Se puede ampliar
 * después vía POST /api/projects sin tocar código. */
const DEFAULT_PROJECTS = [
  { slug: 'stp-erp', name: 'STP ERP', code: 'ERP' },
  { slug: 'stp-mobile', name: 'STP Técnicos (app móvil)', code: 'MOB' },
  { slug: 'vigia', name: 'Vigía', code: 'VIG' },
  { slug: 'stp-tickets', name: 'STP Tickets (este sistema)', code: 'TIX' },
  { slug: 'ecf-saas', name: 'eCF-SaaS', code: 'ECF' },
  { slug: 'estructuralrd', name: 'EstrucCalc RD Pro', code: 'EST' },
  { slug: 'mi-dia', name: 'Mi Día app', code: 'DIA' },
  { slug: 'red-bendicion', name: 'Red Bendición', code: 'RBN' },
  { slug: 'fiscord', name: 'FiscoRD', code: 'FRD' },
  { slug: 'stp-smart-home', name: 'STP Smart Home', code: 'SH' },
];

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // CORS: lista de orígenes en CORS_ORIGINS (separados por coma). Si no está
  // definida se mantiene el comportamiento anterior ('*') con un aviso.
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (corsOrigins.length > 0) {
    app.enableCors({ origin: corsOrigins });
  } else {
    console.warn(
      'AVISO: CORS_ORIGINS no definida; CORS abierto a cualquier origen (*). Define CORS_ORIGINS=https://tickets.stpsoluciones.com,... para restringirlo.',
    );
    app.enableCors({ origin: '*' });
  }
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.get(ProjectsService).seedIfEmpty(DEFAULT_PROJECTS);

  const port = process.env.PORT ?? 3003;
  await app.listen(port);
  console.log(`Tickets backend running on port ${port}`);
}
bootstrap();
