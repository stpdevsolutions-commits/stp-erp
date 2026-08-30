import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { WhatsappService } from './whatsapp.service';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';

@Global()
@Module({
  controllers: [WhatsappWebhookController],
  providers: [NotificationsService, WhatsappService],
  exports: [NotificationsService, WhatsappService],
})
export class NotificationsModule {}
