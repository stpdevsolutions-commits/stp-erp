import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ModulePermissionGuard } from '../common/access/module-permission.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { SubscribeDto, UnsubscribeDto } from './dto/push.dto';
import { isAllowedPushEndpoint, PushService } from './push.service';

interface AuthUser {
  id: string;
}

/** Suscripción a avisos push de la bandeja (ERP-58): solo quien tiene el módulo 'mensajes'. */
@Controller('push')
@UseGuards(JwtAuthGuard, ModulePermissionGuard)
@RequireModule('mensajes', 'view')
export class PushController {
  constructor(private readonly service: PushService) {}

  @Get('public-key')
  publicKey() {
    const key = this.service.getPublicKey();
    if (!key)
      throw new NotFoundException('Los avisos push no están configurados.');
    return { publicKey: key };
  }

  @Post('subscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  async subscribe(
    @Body() dto: SubscribeDto,
    @CurrentUser() user: AuthUser,
    @Headers('user-agent') userAgent?: string,
  ) {
    if (!this.service.enabled)
      throw new NotFoundException('Los avisos push no están configurados.');
    if (!isAllowedPushEndpoint(dto.endpoint))
      throw new BadRequestException('Servicio de push no admitido.');
    await this.service.subscribe(
      user.id,
      { endpoint: dto.endpoint, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
      userAgent,
    );
  }

  @Delete('subscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsubscribe(
    @Body() dto: UnsubscribeDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.service.unsubscribe(user.id, dto.endpoint);
  }
}
