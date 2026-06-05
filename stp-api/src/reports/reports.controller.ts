import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MANAGER)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  getDashboard() {
    return this.reportsService.getDashboard();
  }

  @Get('projects/:id')
  getProjectSummary(@Param('id', ParseUUIDPipe) id: string) {
    return this.reportsService.getProjectSummary(id);
  }

  @Get('clients/:id')
  getClientBalance(@Param('id', ParseUUIDPipe) id: string) {
    return this.reportsService.getClientBalance(id);
  }
}
