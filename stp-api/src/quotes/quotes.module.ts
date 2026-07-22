import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Quote } from './entities/quote.entity';
import { QuoteItem } from './entities/quote-item.entity';
import { Client } from '../clients/entities/client.entity';
import { Project } from '../projects/entities/project.entity';
import { FileUpload } from '../files/entities/file-upload.entity';
import { QuotesService } from './quotes.service';
import { QuotesController } from './quotes.controller';
import { QuotesPublicController } from './quotes-public.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Quote, QuoteItem, Client, Project, FileUpload]),
    SettingsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [QuotesService],
  // El controlador público debe registrarse ANTES que QuotesController para que la
  // ruta estática GET /quotes/decision gane a GET /quotes/:id en la resolución.
  controllers: [QuotesPublicController, QuotesController],
  exports: [QuotesService],
})
export class QuotesModule {}
