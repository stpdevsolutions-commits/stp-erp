import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSettings } from './entities/app-settings.entity';
import { CompanyData, COMPANY } from '../common/company';

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

  async getCompanyData(): Promise<CompanyData> {
    const fields = Object.keys(COMPANY) as (keyof CompanyData)[];
    const result = { ...COMPANY };
    for (const field of fields) {
      const stored = await this.get(`company_${field}`);
      if (stored !== null) (result as Record<string, string>)[field] = stored;
    }
    return result;
  }

  async setCompanyData(data: Partial<CompanyData>): Promise<void> {
    const fields = Object.keys(data) as (keyof CompanyData)[];
    for (const field of fields) {
      const value = data[field];
      if (value !== undefined) await this.set(`company_${field}`, value);
    }
  }

  async getDefaultTerms(): Promise<string | null> {
    return this.get('default_terms');
  }

  async setDefaultTerms(terms: string): Promise<void> {
    await this.set('default_terms', terms);
  }
}
