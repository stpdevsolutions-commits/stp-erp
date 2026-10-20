import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WaContact } from './entities/wa-contact.entity';
import { WaMessage } from './entities/wa-message.entity';
import { WaSuggestion } from './entities/wa-suggestion.entity';
import { CopilotService } from './copilot/copilot.service';
import { CopilotEngine } from './copilot/copilot-engine';
import { CopilotController } from './copilot/copilot.controller';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';
import { User } from '../users/entities/user.entity';
import { Client } from '../clients/entities/client.entity';
import { PushModule } from '../push/push.module';

/** Bandeja de WhatsApp y CRM ligero (ERP-57). NotificationsModule es global y aporta WhatsappService. */
@Module({
  imports: [TypeOrmModule.forFeature([WaContact, WaMessage, WaSuggestion, User, Client]), PushModule],
  controllers: [MessagingController, CopilotController],
  providers: [MessagingService, CopilotEngine, CopilotService],
  exports: [MessagingService],
})
export class MessagingModule {}
