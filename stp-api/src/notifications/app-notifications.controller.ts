import { Controller, Get, Patch, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { AppNotificationsService } from './app-notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

interface AuthUser {
  id: string;
}

// Sin @RequireModule: el feed es siempre "lo mío" (filtrado por userId), no
// un módulo del ERP que se pueda ver/gestionar — cualquier autenticado ve
// únicamente sus propias notificaciones.
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class AppNotificationsController {
  constructor(private readonly service: AppNotificationsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('page') page?: string) {
    return this.service.findForUser(user.id, page ? Number(page) : 1);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthUser) {
    return { count: await this.service.unreadCount(user.id) };
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.service.markAllRead(user.id);
  }

  @Patch(':id/read')
  markRead(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.markRead(id, user.id);
  }
}
