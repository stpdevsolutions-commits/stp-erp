import {
  Controller,
  Post,
  Get,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
  StreamableFile,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { getUploadRoot } from '../files/files.utils';

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
}
