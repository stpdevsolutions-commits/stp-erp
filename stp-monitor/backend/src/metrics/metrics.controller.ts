import { Controller, Get } from '@nestjs/common';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('current')
  getCurrent() {
    return this.metrics.getMetrics();
  }

  @Get('history')
  getHistory() {
    return this.metrics.getHistory();
  }
}
