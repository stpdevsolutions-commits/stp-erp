import { Controller, Get, Param } from '@nestjs/common';
import { ServicesService } from './services.service';

@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  getAll() {
    return this.services.getStatuses();
  }

  @Get(':id/history')
  getHistory(@Param('id') id: string) {
    return this.services.getServiceHistory(id);
  }
}
