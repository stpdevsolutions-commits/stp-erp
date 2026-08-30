import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ProjectsService } from './projects/projects.service';

/** Catálogo inicial — los proyectos que ya lleva STP hoy. Se puede ampliar
 * después vía POST /api/projects sin tocar código. */
const DEFAULT_PROJECTS = [
  { slug: 'stp-erp', name: 'STP ERP' },
  { slug: 'stp-mobile', name: 'STP Técnicos (app móvil)' },
  { slug: 'vigia', name: 'Vigía' },
  { slug: 'stp-tickets', name: 'STP Tickets (este sistema)' },
  { slug: 'ecf-saas', name: 'eCF-SaaS' },
  { slug: 'estructuralrd', name: 'EstrucCalc RD Pro' },
  { slug: 'mi-dia', name: 'Mi Día app' },
  { slug: 'red-bendicion', name: 'Red Bendición' },
  { slug: 'fiscord', name: 'FiscoRD' },
  { slug: 'stp-smart-home', name: 'STP Smart Home' },
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
