import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { WhatsappService } from './whatsapp.service';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { WhatsappInboxService } from './whatsapp-inbox.service';
import { AppNotificationsService } from './app-notifications.service';
import { AppNotificationsController } from './app-notifications.controller';
import { Notification } from './entities/notification.entity';
import { User } from '../users/entities/user.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Notification, User])],
  controllers: [WhatsappWebhookController, AppNotificationsController],
  providers: [NotificationsService, WhatsappService, AppNotificationsService, WhatsappInboxService],
  exports: [NotificationsService, WhatsappService, AppNotificationsService, WhatsappInboxService],
})
export class NotificationsModule {}
