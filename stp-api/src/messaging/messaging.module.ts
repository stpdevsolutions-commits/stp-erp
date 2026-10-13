import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WaContact } from './entities/wa-contact.entity';
import { WaMessage } from './entities/wa-message.entity';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';
import { User } from '../users/entities/user.entity';
import { Client } from '../clients/entities/client.entity';

/** Bandeja de WhatsApp y CRM ligero (ERP-57). NotificationsModule es global y aporta WhatsappService. */
@Module({
  imports: [TypeOrmModule.forFeature([WaContact, WaMessage, User, Client])],
  controllers: [MessagingController],
  providers: [MessagingService],
  exports: [MessagingService],
})
export class MessagingModule {}
