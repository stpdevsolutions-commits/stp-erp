import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { WhatsappService } from './whatsapp.service';

@Global()
@Module({
  providers: [NotificationsService, WhatsappService],
  exports: [NotificationsService, WhatsappService],
})
export class NotificationsModule {}
