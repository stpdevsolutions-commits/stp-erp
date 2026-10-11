import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { DgiiService } from './dgii.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModulePermissionGuard } from '../common/access/module-permission.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { normalizeNcf, normalizeRnc } from '../fiscal-invoices/fiscal-invoice-rules';

export class CheckComprobanteDto {
  @Transform(({ value }) => (typeof value === 'string' ? normalizeRnc(value) : value))
  @Matches(/^(\d{9}|\d{11})$/, { message: 'El RNC del emisor debe tener 9 dígitos (11 si es cédula)' })
  rnc: string;

  @Transform(({ value }) => (typeof value === 'string' ? normalizeNcf(value) : value))
  @Matches(/^(B\d{10}|E\d{12})$/, { message: 'NCF no válido' })
  ncf: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? normalizeRnc(value) : value))
  @Matches(/^(\d{9}|\d{11})?$/, { message: 'El RNC del comprador debe tener 9 dígitos (11 si es cédula)' })
  rncComprador?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  codigoSeguridad?: string;
}

/**
 * Consultas a la DGII (RNC y comprobantes) para el módulo de facturas. Pegan contra un
 * sitio externo, así que van con límite de peticiones y solo para quien gestiona facturas.
 */
@Controller('dgii')
@UseGuards(JwtAuthGuard, ModulePermissionGuard)
@RequireModule('facturas', 'manage')
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class DgiiController {
  constructor(private readonly dgii: DgiiService) {}

  @Get('rnc/:rnc')
  rnc(@Param('rnc') raw: string) {
    const rnc = normalizeRnc(raw);
    if (!/^(\d{9}|\d{11})$/.test(rnc)) throw new BadRequestException('RNC inválido: 9 dígitos (11 si es cédula)');
    return this.dgii.lookupRnc(rnc);
  }

  @Get('rnc-search')
  async search(@Query('name') name?: string) {
    const term = (name ?? '').trim();
    if (term.length < 3) throw new BadRequestException('Escribe al menos 3 letras del nombre');
    return { results: await this.dgii.searchByName(term) };
  }

  @Post('comprobante')
  check(@Body() dto: CheckComprobanteDto) {
    return this.dgii.checkComprobante(dto);
  }
}
