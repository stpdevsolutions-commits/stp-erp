import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModulePermissionGuard } from '../../common/access/module-permission.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { CopilotService } from './copilot.service';
import { SendSuggestionDto, SimulateDto } from './copilot.dto';

interface AuthUser {
  id: string;
}

/** Sugerencias del copiloto de WhatsApp (ERP-56, fase 2). Mismo módulo de permisos que la bandeja: 'mensajes'. */
@Controller('messaging')
@UseGuards(JwtAuthGuard, ModulePermissionGuard)
@RequireModule('mensajes', 'view')
export class CopilotController {
  constructor(private readonly copilot: CopilotService) {}

  /** Sugerencia vigente de una conversación (null si no hay o ya no aplica). */
  @Get('contacts/:id/suggestion')
  async current(@Param('id', ParseUUIDPipe) id: string) {
    return { enabled: this.copilot.enabled, suggestion: await this.copilot.getForContact(id) };
  }

  @Post('suggestions/:id/send')
  @RequireModule('mensajes', 'manage')
  send(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SendSuggestionDto, @CurrentUser() user: AuthUser) {
    return this.copilot.send(user.id, id, dto.text);
  }

  @Post('suggestions/:id/discard')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireModule('mensajes', 'manage')
  discard(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.copilot.discard(user.id, id);
  }

  @Post('suggestions/:id/apply')
  @RequireModule('mensajes', 'manage')
  apply(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.copilot.applyData(user.id, id);
  }

  /** Prueba con mensajes de ejemplo: no guarda nada. */
  @Post('copilot/simulate')
  @RequireModule('mensajes', 'manage')
  simulate(@Body() dto: SimulateDto) {
    return this.copilot.simulate(dto);
  }
}
