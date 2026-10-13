import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { MessagingService } from './messaging.service';
import { QueryContactsDto, QueryMessagesDto, SendTemplateDto, SendTextDto, UpdateContactDto } from './dto/messaging.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ModulePermissionGuard } from '../common/access/module-permission.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';

interface AuthUser {
  id: string;
}

/**
 * Bandeja de WhatsApp y CRM ligero (ERP-57). Módulo 'mensajes': hoy admin y manager gestionan;
 * finanza y user no lo ven. Las respuestas salen siempre del servidor (el token de Meta nunca llega al navegador).
 */
@Controller('messaging')
@UseGuards(JwtAuthGuard, ModulePermissionGuard)
@RequireModule('mensajes', 'view')
export class MessagingController {
  constructor(private readonly service: MessagingService) {}

  @Get('contacts')
  list(@Query() query: QueryContactsDto, @CurrentUser() user: AuthUser) {
    return this.service.list(user.id, query);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.service.summary(user.id);
  }

  @Get('templates')
  templates() {
    return this.service.templates();
  }

  @Get('agents')
  agents() {
    return this.service.agents();
  }

  @Get('contacts/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Get('contacts/:id/messages')
  thread(@Param('id', ParseUUIDPipe) id: string, @Query() query: QueryMessagesDto) {
    return this.service.thread(id, query);
  }

  @Post('contacts/:id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireModule('mensajes', 'manage')
  markRead(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.markRead(id);
  }

  @Post('contacts/:id/messages')
  @RequireModule('mensajes', 'manage')
  sendText(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SendTextDto, @CurrentUser() user: AuthUser) {
    return this.service.sendText(user.id, id, dto.text);
  }

  @Post('contacts/:id/attachments')
  @RequireModule('mensajes', 'manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  sendAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string; size: number } | undefined,
    @Body('caption') caption: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.sendAttachment(user.id, id, file, caption?.slice(0, 1000));
  }

  @Get('clients')
  searchClients(@Query('search') search: string | undefined) {
    return this.service.searchClients(search ?? '');
  }

  @Post('contacts/:id/templates')
  @RequireModule('mensajes', 'manage')
  sendTemplate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SendTemplateDto, @CurrentUser() user: AuthUser) {
    return this.service.sendTemplate(user.id, id, dto.name, dto.params);
  }

  @Post('contacts/:id/take')
  @RequireModule('mensajes', 'manage')
  take(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.take(user.id, id);
  }

  @Patch('contacts/:id')
  @RequireModule('mensajes', 'manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateContactDto) {
    return this.service.update(id, dto);
  }

  /** Adjunto de un mensaje (foto, PDF, nota de voz) ya guardado en el servidor. */
  @Get('messages/:id/media')
  async media(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const f = await this.service.mediaFile(id);
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(f.filename)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(f.abs);
  }
}
