import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NotificationsService } from './notifications/notifications.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: '*' });
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ?? 3002);
  console.log(`Vigía backend running on port ${process.env.PORT ?? 3002}`);

  const notifications = app.get(NotificationsService);
  const now = new Date().toLocaleString('es-DO');
  await notifications.sendTelegram(
    `🟢 <b>Vigía en Línea</b>\n` +
    `⏰ <b>Hora:</b> ${now}\n` +
    `🖥️ <b>Sistema:</b> monitor.stpsoluciones.com\n` +
    `🔄 El monitoreo está activo y todos los servicios serán verificados en breve.`,
  );
}
bootstrap();
