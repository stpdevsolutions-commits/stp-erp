import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CollaboratorLoansService } from './collaborator-loans.service';
import { CreateCollaboratorLoanDto } from './dto/create-collaborator-loan.dto';
import { UpdateCollaboratorLoanDto } from './dto/update-collaborator-loan.dto';
import { QueryCollaboratorLoansDto } from './dto/query-collaborator-loans.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModulePermissionGuard } from '../common/access/module-permission.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';

// Mismo criterio de acceso que /payroll (ver payroll.controller.ts): un
// préstamo es información salarial, así que exige 'manage' sobre 'nomina'
// completo (admin/finanza), sin acotado por pertenencia. No hay DELETE: un
// préstamo es un registro financiero que se cancela (status), no se borra.
@Controller('payroll/loans')
@UseGuards(JwtAuthGuard, ModulePermissionGuard)
@RequireModule('nomina', 'manage')
export class CollaboratorLoansController {
  constructor(private readonly loansService: CollaboratorLoansService) {}

  @Post()
  create(@Body() dto: CreateCollaboratorLoanDto) {
    return this.loansService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryCollaboratorLoansDto) {
    return this.loansService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.loansService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCollaboratorLoanDto) {
    return this.loansService.update(id, dto);
  }
}
