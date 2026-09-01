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
  app.enableCors({ origin: '*' });
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.get(ProjectsService).seedIfEmpty(DEFAULT_PROJECTS);

  const port = process.env.PORT ?? 3003;
  await app.listen(port);
  console.log(`Tickets backend running on port ${port}`);
}
bootstrap();
