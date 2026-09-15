import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true conserva los bytes crudos del cuerpo (además del JSON ya
  // parseado) para poder verificar la firma HMAC del webhook de WhatsApp;
  // no cambia nada para el resto de las rutas.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // El límite de intentos (ThrottlerGuard) usa req.ip. Sin esto, toda
  // petición que llega vía stp-landing (el flujo normal del ERP web) se ve
  // con la MISMA ip — la del contenedor de Next, no la del usuario real —
  // porque ese fetch interno es una petición nueva, no un passthrough.
  // stp-api nunca queda expuesto directo a internet (Caddy filtra por IP de
  // VPN/LAN incluso en api.stpsoluciones.com), así que confiar en el header
  // aquí no abre una vía de spoofing desde fuera.
  app.getHttpAdapter().getInstance().set('trust proxy', true);

  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('STP ERP API')
      .setDescription('API de gestión para Soluciones Técnicas Profesionales')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
