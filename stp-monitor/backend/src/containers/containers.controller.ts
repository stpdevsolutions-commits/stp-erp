import { Controller, Get } from '@nestjs/common';
import { ContainersService } from './containers.service';

@Controller('containers')
export class ContainersController {
  constructor(private readonly containers: ContainersService) {}

  @Get()
  getAll() {
    return this.containers.getContainers();
  }
}
