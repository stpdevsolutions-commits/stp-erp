import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Res,
  UploadedFile,
  ParseFilePipe,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiBody, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { FilesService } from './files.service';
import { FileContext } from './entities/file-upload.entity';
import { QueryFilesDto } from './dto/query-files.dto';
import {
  clientProfileOpts,
  clientDocumentsOpts,
  clientQuotesOpts,
  clientPaymentsOpts,
  projectPhotosOpts,
  projectDocumentsOpts,
  projectExpensesOpts,
  projectQuotesOpts,
  projectPaymentsOpts,
  fichaPhotosOpts,
  FILE_UPLOAD_BODY,
} from './files.utils';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ScopedResource } from '../common/decorators/scoped-resource.decorator';
import { ResourceAccessGuard } from '../common/guards/resource-access.guard';
import { ModulePermissionGuard } from '../common/access/module-permission.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { UserRole } from '../users/entities/user.entity';

/**
 * Modulo 'archivos' (ERP-83/ERP-85): admin/manager = manage, finanza = view,
 * user = "Ver/Subir" (acotado por pertenencia via ScopedResource).
 *
 * ERP-109 (resuelto): los endpoints de subida piden 'contribute', no
 * 'manage' -- 'user' tiene 'contribute' en la matriz (ve + sube, sin poder
 * borrar lo de otros) y 'finanza' se queda en 'view' (sigue sin poder
 * subir). Solo el borrado (@Delete) sigue pidiendo 'manage': con
 * 'contribute' unicamente, 'user' hubiera podido subir Y borrar cualquier
 * archivo de su alcance, que la matriz nunca quiso darle.
 */
@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
@UseGuards(JwtAuthGuard, ResourceAccessGuard, ModulePermissionGuard)
@RequireModule('archivos', 'view')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  // ── Fotos de fichas técnicas (acceso: cualquier técnico autenticado) ─────────

  @Post('fichas-photo')
  @ScopedResource({ kind: 'project', param: 'projectId', in: 'query' })
  @UseInterceptors(FileInterceptor('file', fichaPhotosOpts))
  @ApiOperation({ summary: 'Subir foto para ficha técnica' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_UPLOAD_BODY)
  async uploadFichaPhoto(
    @Query('projectId') projectId: string,
    @UploadedFile(new ParseFilePipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }))
    file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    if (!projectId) throw new BadRequestException('projectId es requerido');
    return this.filesService.saveProjectPhotoForFicha(file, projectId, user.id);
  }

  // ── Perfil del cliente ──────────────────────────────────────────

  @Post('clients/:clientId/profile')
  @ScopedResource({ kind: 'client', param: 'clientId', strict: true })
  @RequireModule('archivos', 'contribute')
  @UseInterceptors(FileInterceptor('file', clientProfileOpts))
  @ApiOperation({ summary: 'Subir imagen de perfil del cliente' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_UPLOAD_BODY)
  uploadClientProfile(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @UploadedFile(new ParseFilePipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }))
    file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.filesService.saveRecord(file, FileContext.CLIENT_PROFILE, clientId, null, user.id);
  }

  @Get('clients/:clientId/profile')
  @ScopedResource({ kind: 'client', param: 'clientId', strict: true })
  @ApiOperation({ summary: 'Listar archivos de perfil del cliente' })
  listClientProfile(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query() query: QueryFilesDto,
  ) {
    return this.filesService.findByClient(clientId, { ...query, context: FileContext.CLIENT_PROFILE });
  }

  // ── Documentos del cliente (sin proyecto) ──────────────────────

  @Post('clients/:clientId/documents')
  @ScopedResource({ kind: 'client', param: 'clientId', strict: true })
  @RequireModule('archivos', 'contribute')
  @UseInterceptors(FileInterceptor('file', clientDocumentsOpts))
  @ApiOperation({ summary: 'Subir documento al cliente' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_UPLOAD_BODY)
  uploadClientDocument(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @UploadedFile(new ParseFilePipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }))
    file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.filesService.saveRecord(file, FileContext.CLIENT_DOCUMENTS, clientId, null, user.id);
  }

  @Get('clients/:clientId/documents')
  @ScopedResource({ kind: 'client', param: 'clientId', strict: true })
  @ApiOperation({ summary: 'Listar documentos del cliente' })
  listClientDocuments(
    @Param('clientId', ParseUUIDPipe) clientId: string,
  ) {
    return this.filesService.findByClient(clientId, { context: FileContext.CLIENT_DOCUMENTS });
  }

  // ── Cotizaciones del cliente (sin proyecto) ─────────────────────

  @Post('clients/:clientId/quotes')
  @ScopedResource({ kind: 'client', param: 'clientId', strict: true })
  @RequireModule('archivos', 'contribute')
  @UseInterceptors(FileInterceptor('file', clientQuotesOpts))
  @ApiOperation({ summary: 'Subir documento de cotización del cliente' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_UPLOAD_BODY)
  uploadClientQuote(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @UploadedFile(new ParseFilePipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }))
    file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.filesService.saveRecord(file, FileContext.CLIENT_QUOTES, clientId, null, user.id);
  }

  // ── Fotos del proyecto ──────────────────────────────────────────

  @Post('clients/:clientId/projects/:projectId/photos')
  @ScopedResource({ kind: 'client', param: 'clientId' }, { kind: 'project', param: 'projectId' })
  @RequireModule('archivos', 'contribute')
  @UseInterceptors(FileInterceptor('file', projectPhotosOpts))
  @ApiOperation({ summary: 'Subir foto al proyecto' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_UPLOAD_BODY)
  uploadProjectPhoto(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @UploadedFile(new ParseFilePipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }))
    file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.filesService.saveRecord(file, FileContext.PROJECT_PHOTOS, clientId, projectId, user.id);
  }

  // ── Documentos del proyecto ─────────────────────────────────────

  @Post('clients/:clientId/projects/:projectId/documents')
  @ScopedResource({ kind: 'client', param: 'clientId' }, { kind: 'project', param: 'projectId' })
  @RequireModule('archivos', 'contribute')
  @UseInterceptors(FileInterceptor('file', projectDocumentsOpts))
  @ApiOperation({ summary: 'Subir documento al proyecto' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_UPLOAD_BODY)
  uploadProjectDocument(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @UploadedFile(new ParseFilePipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }))
    file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.filesService.saveRecord(file, FileContext.PROJECT_DOCUMENTS, clientId, projectId, user.id);
  }

  // ── Comprobantes de gastos ──────────────────────────────────────

  @Post('clients/:clientId/projects/:projectId/expenses')
  @ScopedResource({ kind: 'client', param: 'clientId' }, { kind: 'project', param: 'projectId' })
  @RequireModule('archivos', 'contribute')
  @UseInterceptors(FileInterceptor('file', projectExpensesOpts))
  @ApiOperation({ summary: 'Subir comprobante de gasto al proyecto' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_UPLOAD_BODY)
  uploadProjectExpense(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @UploadedFile(new ParseFilePipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }))
    file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.filesService.saveRecord(file, FileContext.PROJECT_EXPENSES, clientId, projectId, user.id);
  }

  // ── Archivos de cotizaciones ────────────────────────────────────

  @Post('clients/:clientId/projects/:projectId/quotes')
  @ScopedResource({ kind: 'client', param: 'clientId' }, { kind: 'project', param: 'projectId' })
  @RequireModule('archivos', 'contribute')
  @UseInterceptors(FileInterceptor('file', projectQuotesOpts))
  @ApiOperation({ summary: 'Subir archivo de cotización al proyecto' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_UPLOAD_BODY)
  uploadProjectQuote(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @UploadedFile(new ParseFilePipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }))
    file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.filesService.saveRecord(file, FileContext.PROJECT_QUOTES, clientId, projectId, user.id);
  }

  // ── Pagos del cliente (sin proyecto) ────────────────────────────

  @Post('clients/:clientId/payments')
  @ScopedResource({ kind: 'client', param: 'clientId', strict: true })
  @RequireModule('archivos', 'contribute')
  @UseInterceptors(FileInterceptor('file', clientPaymentsOpts))
  @ApiOperation({ summary: 'Subir comprobante de pago del cliente' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_UPLOAD_BODY)
  uploadClientPayment(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @UploadedFile(new ParseFilePipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }))
    file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.filesService.saveRecord(file, FileContext.CLIENT_PAYMENTS, clientId, null, user.id);
  }

  // ── Pagos del proyecto ───────────────────────────────────────────

  @Post('clients/:clientId/projects/:projectId/payments')
  @ScopedResource({ kind: 'client', param: 'clientId' }, { kind: 'project', param: 'projectId' })
  @RequireModule('archivos', 'contribute')
  @UseInterceptors(FileInterceptor('file', projectPaymentsOpts))
  @ApiOperation({ summary: 'Subir comprobante de pago del proyecto' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_UPLOAD_BODY)
  uploadProjectPayment(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @UploadedFile(new ParseFilePipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }))
    file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.filesService.saveRecord(file, FileContext.PROJECT_PAYMENTS, clientId, projectId, user.id);
  }

  // ── Listados ────────────────────────────────────────────────────

  @Get('clients/:clientId')
  @ScopedResource({ kind: 'client', param: 'clientId', strict: true })
  @ApiOperation({ summary: 'Listar archivos de un cliente (todos los contextos)' })
  listClientFiles(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query() query: QueryFilesDto,
  ) {
    return this.filesService.findByClient(clientId, query);
  }

  @Get('clients/:clientId/projects/:projectId')
  @ScopedResource({ kind: 'client', param: 'clientId' }, { kind: 'project', param: 'projectId' })
  @ApiOperation({ summary: 'Listar archivos de un proyecto' })
  listProjectFiles(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: QueryFilesDto,
  ) {
    return this.filesService.findByProject(clientId, projectId, query);
  }

  // ── Descarga ────────────────────────────────────────────────────

  @Get(':id/download')
  @ScopedResource('file')
  @ApiOperation({ summary: 'Descargar un archivo por ID' })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const { absolutePath, record } = await this.filesService.getAbsolutePath(id);
    // `@ScopedResource('file')` solo comprueba pertenencia al proyecto/cliente: un
    // informe interno (nómina + márgenes) archivado ahí es un archivo más para ese
    // chequeo, así que sin esto cualquier miembro del proyecto —incluyendo USER—
    // podía descargarlo aunque el propio módulo de informes se lo negara.
    if (
      record.context === FileContext.PROJECT_REPORTS_INTERNAL &&
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.MANAGER
    ) {
      throw new ForbiddenException('Este informe requiere rol MANAGER o ADMIN');
    }
    const safeName = record.originalName.replace(/["\r\n\\]/g, '_');
    res.setHeader('Content-Type', record.mimetype);
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(record.originalName)}`);
    res.sendFile(absolutePath);
  }

  // ── Eliminar ────────────────────────────────────────────────────

  @Delete(':id')
  @ScopedResource('file')
  @RequireModule('archivos', 'manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un archivo' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.filesService.remove(id);
  }
}
