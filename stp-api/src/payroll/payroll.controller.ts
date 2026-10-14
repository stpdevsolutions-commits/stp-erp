import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  addReportSheet,
  createWorkbook,
  dateOnly,
  sendWorkbook,
  type ReportColumn,
} from '../common/excel-report';
import { BadRequestException } from '@nestjs/common';
import { todayRD } from '../common/dates';
import { PayrollService } from './payroll.service';
import { CreatePayrollEntryDto } from './dto/create-payroll-entry.dto';
import { UpdatePayrollEntryDto } from './dto/update-payroll-entry.dto';
import { QueryPayrollDto } from './dto/query-payroll.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ModulePermissionGuard } from '../common/access/module-permission.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

/**
 * Nómina es información salarial: el módulo ENTERO exige acceso 'manage' a
 * `nomina` en la matriz de permisos por rol (ERP-83/ERP-85) — hoy eso es
 * ADMIN y FINANZA, ya NO manager (antes tenía acceso vía RolesGuard por
 * rango; la matriz lo excluye a propósito, confidencialidad salarial). No
 * lleva el acotado por pertenencia del resto de módulos, que existe para
 * los USER — aquí no entra ninguno de todos modos.
 *
 * RolesGuard se mantiene solo para el endpoint de borrado, que sigue
 * restringido a ADMIN exclusivamente (ver @Roles ahí abajo) — una
 * protección extra por encima de la matriz, no reemplazada por ella.
 */
@Controller('payroll')
@UseGuards(JwtAuthGuard, ModulePermissionGuard, RolesGuard)
@RequireModule('nomina', 'manage')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post()
  create(@Body() dto: CreatePayrollEntryDto, @CurrentUser() user: AuthUser) {
    return this.payrollService.create(dto, user.id);
  }

  @Get()
  findAll(@Query() query: QueryPayrollDto) {
    return this.payrollService.findAll(query);
  }

  // Antes de /:id para que 'summary' no se lea como UUID.
  @Get('summary')
  summary() {
    return this.payrollService.summary();
  }

  /**
   * Excel de retenciones aplicadas en la nómina de un mes (por fecha de pago): detalle por pago y
   * resumen por colaborador, con cédula, para declararlas a la DGII.
   */
  @Get('export/retenciones')
  async exportRetenciones(@Query('month') month: string | undefined, @Res() res: Response): Promise<void> {
    const mes = month || todayRD().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new BadRequestException('Indica el mes con el formato AAAA-MM');
    const entries = await this.payrollService.retentionsForMonth(mes);

    interface Row {
      cedula: string;
      tipoId: string;
      nombre: string;
      numero: string;
      fechaPago: string;
      periodo: string;
      bruto: number;
      pct: number;
      retenido: number;
      neto: number;
    }
    const rows: Row[] = entries.map((e) => {
      const cedula = (e.collaborator?.cedula ?? '').replace(/\D/g, '');
      return {
        cedula,
        tipoId: cedula.length === 9 ? '1' : cedula.length === 11 ? '2' : '',
        nombre: e.collaborator ? `${e.collaborator.firstName} ${e.collaborator.lastName}` : '—',
        numero: e.number,
        fechaPago: e.paymentDate,
        periodo: `${e.periodStart} a ${e.periodEnd}`,
        bruto: e.grossAmount,
        pct: e.retentionPercent,
        retenido: e.retentionAmount,
        neto: e.netAmount,
      };
    });

    const wb = createWorkbook();
    const filters = [{ label: 'Mes (por fecha de pago)', value: mes }];
    const detail: ReportColumn<Row>[] = [
      { header: 'Cédula / RNC', value: (r) => r.cedula || 'SIN CÉDULA', width: 16 },
      { header: 'Tipo ID (1=RNC, 2=Cédula)', value: (r) => r.tipoId, width: 12 },
      { header: 'Beneficiario', value: (r) => r.nombre, width: 30 },
      { header: 'Nº nómina', value: (r) => r.numero, width: 14 },
      { header: 'Fecha de pago', value: (r) => dateOnly(r.fechaPago), type: 'date' },
      { header: 'Período trabajado', value: (r) => r.periodo, width: 24 },
      { header: 'Monto bruto sujeto a retención', value: (r) => r.bruto, type: 'money', total: true },
      { header: '% retenido', value: (r) => r.pct, type: 'percent' },
      { header: 'Retención ISR', value: (r) => r.retenido, type: 'money', total: true },
      { header: 'Neto pagado', value: (r) => r.neto, type: 'money', total: true },
    ];
    addReportSheet(wb, { sheetName: 'Detalle', title: 'Retenciones en nómina — detalle por pago', filters, columns: detail, rows });

    const byPerson = new Map<string, Row & { pagos: number }>();
    for (const r of rows) {
      const key = r.cedula || r.nombre;
      const acc = byPerson.get(key);
      if (acc) {
        acc.bruto += r.bruto;
        acc.retenido += r.retenido;
        acc.neto += r.neto;
        acc.pagos += 1;
      } else byPerson.set(key, { ...r, pagos: 1 });
    }
    const summary: ReportColumn<Row & { pagos: number }>[] = [
      { header: 'Cédula / RNC', value: (r) => r.cedula || 'SIN CÉDULA', width: 16 },
      { header: 'Tipo ID (1=RNC, 2=Cédula)', value: (r) => r.tipoId, width: 12 },
      { header: 'Beneficiario', value: (r) => r.nombre, width: 30 },
      { header: 'Pagos', value: (r) => r.pagos, type: 'int' },
      { header: 'Monto bruto', value: (r) => r.bruto, type: 'money', total: true },
      { header: 'Retención ISR', value: (r) => r.retenido, type: 'money', total: true },
      { header: 'Neto pagado', value: (r) => r.neto, type: 'money', total: true },
    ];
    addReportSheet(wb, {
      sheetName: 'Resumen por beneficiario',
      title: 'Retenciones en nómina — resumen por beneficiario',
      filters,
      columns: summary,
      rows: [...byPerson.values()],
    });
    await sendWorkbook(res, wb, `retenciones-nomina_${mes}`);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.payrollService.findOne(id);
  }

  /** Recibo para imprimir y firmar. `inline` para que el navegador lo previsualice. */
  @Get(':id/recibo')
  async recibo(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { buffer, filename } = await this.payrollService.generateReceipt(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayrollEntryDto,
  ) {
    return this.payrollService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.payrollService.remove(id);
  }
}
