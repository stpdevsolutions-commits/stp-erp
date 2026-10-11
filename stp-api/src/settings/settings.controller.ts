import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
  StreamableFile,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { getUploadRoot } from '../files/files.utils';
import type { CompanyData } from '../common/company';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateTermsDto } from './dto/update-terms.dto';

const ALLOWED_IMAGE_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Post('logo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async uploadLogo(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!ALLOWED_IMAGE_MIMETYPES.includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, and WEBP images are allowed');
    }

    const ext = extname(file.originalname).toLowerCase() || `.${file.mimetype.split('/')[1]}`;
    const brandDir = join(getUploadRoot(), 'brand');
    mkdirSync(brandDir, { recursive: true });

    const destFilename = `logo${ext}`;
    const destPath = join(brandDir, destFilename);
    const relativePath = `brand/${destFilename}`;

    // Write buffer to disk (FileInterceptor without storage uses memory storage)
    const { writeFileSync } = await import('fs');
    writeFileSync(destPath, file.buffer);

    await this.settingsService.set('logo_path', relativePath);
    await this.settingsService.set('logo_mimetype', file.mimetype);

    return { ok: true };
  }

  @Get('logo')
  @UseGuards(JwtAuthGuard)
  async getLogo(@Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const logoPath = await this.settingsService.getLogoPath();
    if (!logoPath) throw new NotFoundException('Logo not found');

    const fullPath = join(getUploadRoot(), logoPath);
    if (!existsSync(fullPath)) throw new NotFoundException('Logo file not found');

    const mimetype = await this.settingsService.getLogoMimetype();
    res.set({ 'Content-Type': mimetype });

    const stream = createReadStream(fullPath);
    return new StreamableFile(stream);
  }

  /** Imagen destacada de la pantalla de Inicio (proyecto representativo). */
  @Post('hero')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async uploadHero(
    @UploadedFile() file: Express.Multer.File,
    @Body('caption') caption?: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!ALLOWED_IMAGE_MIMETYPES.includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, and WEBP images are allowed');
    }

    const ext = extname(file.originalname).toLowerCase() || `.${file.mimetype.split('/')[1]}`;
    const brandDir = join(getUploadRoot(), 'brand');
    mkdirSync(brandDir, { recursive: true });

    const destFilename = `hero${ext}`;
    const { writeFileSync } = await import('fs');
    writeFileSync(join(brandDir, destFilename), file.buffer);

    await this.settingsService.set('hero_path', `brand/${destFilename}`);
    await this.settingsService.set('hero_mimetype', file.mimetype);
    await this.settingsService.set('hero_caption', (caption ?? '').trim().slice(0, 120));
    // Cambia en cada subida para que el navegador no sirva la imagen anterior en caché
    await this.settingsService.set('hero_version', String(Date.now()));
    return { ok: true };
  }

  @Get('hero')
  @UseGuards(JwtAuthGuard)
  async getHero(@Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const heroPath = await this.settingsService.get('hero_path');
    if (!heroPath) throw new NotFoundException('Hero not found');
    const fullPath = join(getUploadRoot(), heroPath);
    if (!existsSync(fullPath)) throw new NotFoundException('Hero file not found');
    res.set({ 'Content-Type': (await this.settingsService.get('hero_mimetype')) ?? 'image/jpeg' });
    return new StreamableFile(createReadStream(fullPath));
  }

  /** Metadatos para la pantalla de Inicio: si hay foto, su versión y su pie. */
  @Get('hero-info')
  @UseGuards(JwtAuthGuard)
  async getHeroInfo(): Promise<{ hasImage: boolean; version: string | null; caption: string }> {
    const heroPath = await this.settingsService.get('hero_path');
    const hasImage = !!heroPath && existsSync(join(getUploadRoot(), heroPath));
    return {
      hasImage,
      version: hasImage ? await this.settingsService.get('hero_version') : null,
      caption: (await this.settingsService.get('hero_caption')) ?? '',
    };
  }

  @Delete('hero')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async resetHero() {
    await this.settingsService.set('hero_path', '');
    await this.settingsService.set('hero_caption', '');
    return { ok: true };
  }

  @Get('company')
  @UseGuards(JwtAuthGuard)
  async getCompany(): Promise<CompanyData> {
    return this.settingsService.getCompanyData();
  }

  @Patch('company')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateCompany(@Body() body: UpdateCompanyDto): Promise<CompanyData> {
    await this.settingsService.setCompanyData(body);
    return this.settingsService.getCompanyData();
  }

  @Get('terms')
  @UseGuards(JwtAuthGuard)
  async getTerms(): Promise<{ terms: string | null }> {
    return { terms: await this.settingsService.getDefaultTerms() };
  }

  @Patch('terms')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateTerms(@Body() body: UpdateTermsDto): Promise<{ terms: string | null }> {
    await this.settingsService.setDefaultTerms(body.terms);
    return { terms: await this.settingsService.getDefaultTerms() };
  }
}
