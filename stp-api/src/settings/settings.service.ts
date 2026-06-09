import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSettings } from './entities/app-settings.entity';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(AppSettings)
    private readonly settingsRepository: Repository<AppSettings>,
  ) {}

  async get(key: string): Promise<string | null> {
    const setting = await this.settingsRepository.findOneBy({ key });
    return setting?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.settingsRepository.save({ key, value });
  }

  async getLogoPath(): Promise<string | null> {
    return this.get('logo_path');
  }

  async getLogoMimetype(): Promise<string> {
    return (await this.get('logo_mimetype')) ?? 'image/png';
  }
}
