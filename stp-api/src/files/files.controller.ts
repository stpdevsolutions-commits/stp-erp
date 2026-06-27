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
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  // ── Fotos de fichas técnicas (acceso: cualquier técnico autenticado) ─────────

  @Post('fichas-photo')
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
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
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
  @ApiOperation({ summary: 'Listar archivos de perfil del cliente' })
  listClientProfile(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query() query: QueryFilesDto,
  ) {
    return this.filesService.findByClient(clientId, { ...query, context: FileContext.CLIENT_PROFILE });
  }

  // ── Documentos del cliente (sin proyecto) ──────────────────────

  @Post('clients/:clientId/documents')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
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
  @ApiOperation({ summary: 'Listar documentos del cliente' })
  listClientDocuments(
    @Param('clientId', ParseUUIDPipe) clientId: string,
  ) {
    return this.filesService.findByClient(clientId, { context: FileContext.CLIENT_DOCUMENTS });
  }

  // ── Cotizaciones del cliente (sin proyecto) ─────────────────────

  @Post('clients/:clientId/quotes')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
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
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
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
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
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
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
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
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
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
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
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
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
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
  @ApiOperation({ summary: 'Listar archivos de un cliente (todos los contextos)' })
  listClientFiles(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query() query: QueryFilesDto,
  ) {
    return this.filesService.findByClient(clientId, query);
  }

  @Get('clients/:clientId/projects/:projectId')
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
  @ApiOperation({ summary: 'Descargar un archivo por ID' })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { absolutePath, record } = await this.filesService.getAbsolutePath(id);
    const safeName = record.originalName.replace(/["\r\n\\]/g, '_');
    res.setHeader('Content-Type', record.mimetype);
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(record.originalName)}`);
    res.sendFile(absolutePath);
  }

  // ── Eliminar ────────────────────────────────────────────────────

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un archivo' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.filesService.remove(id);
  }
}
