import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alert } from './entities/alert.entity';

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(Alert)
    private readonly repo: Repository<Alert>,
  ) {}

  async createAlert(serviceId: string, serviceName: string, type: string, message: string) {
    const alert = this.repo.create({ serviceId, serviceName, type, message });
    return this.repo.save(alert);
  }

  getAlerts(limit = 50) {
    return this.repo.find({ order: { createdAt: 'DESC' }, take: limit });
  }
}
