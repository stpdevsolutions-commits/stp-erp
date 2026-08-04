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
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { memoryStorage } from 'multer';
import { PriceImportsService } from './price-imports.service';
import { PRICE_IMPORT_QUEUE, PriceImportJob } from './price-import.processor';
import { CreatePriceImportDto } from './dto/create-price-import.dto';
import { UpdatePriceImportLineDto } from './dto/update-price-import-line.dto';
import { ApprovePriceImportDto } from './dto/approve-price-import.dto';
import { MAX_FILE_SIZE } from '../files/files.utils';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

interface AuthUser {
  id: string;
  role: UserRole;
}

/**
 * Importación de precios desde PDF de proveedor.
 *
 * Todo el módulo es MANAGER+: quien aprueba una línea está fijando el costo con el que
 * se cotiza obra, y eso no es una operación de captura.
 */
@Controller('costs/price-imports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MANAGER)
export class PriceImportsController {
  constructor(
    private readonly importsService: PriceImportsService,
    @InjectQueue(PRICE_IMPORT_QUEUE) private readonly queue: Queue<PriceImportJob>,
  ) {}

  /**
   * Sube el PDF y encola la extracción. Responde en cuanto el archivo está guardado:
   * el resultado se consulta después con GET (`status` va de `pending` a `review`).
   *
   * El archivo se recibe en memoria (no en disco) porque hay que mirar sus primeros
   * bytes antes de decidir si merece quedarse.
   */
  @Post()
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } }),
  )
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreatePriceImportDto,
    @CurrentUser() user: AuthUser,
  ) {
    const record = await this.importsService.create(file, dto, user.id);
    await this.queue.add(
      'extract',
      { importId: record.id },
      {
        // Reintentar dos veces cubre un corte de red o un 529 de la API; más sería
        // pagar tres veces la misma extracción por un PDF que no se puede leer.
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
    return record;
  }

  @Get()
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit: number,
  ) {
    return this.importsService.findAll(page, Math.min(limit, 100));
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.importsService.findOne(id);
  }

  @Patch(':id/lines/:lineId')
  updateLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: UpdatePriceImportLineDto,
  ) {
    return this.importsService.updateLine(id, lineId, dto);
  }

  /** Convierte en precios las líneas indicadas. Es el paso que exige revisión humana. */
  @Post(':id/approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovePriceImportDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.importsService.approve(id, dto, user.id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.importsService.remove(id);
  }
}
