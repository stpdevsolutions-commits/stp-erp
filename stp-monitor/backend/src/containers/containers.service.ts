import { Injectable, Logger } from '@nestjs/common';
import * as Dockerode from 'dockerode';

export interface ContainerInfo {
  name: string;
  status: string;
  image: string;
  uptime: string;
  state: string;
}

@Injectable()
export class ContainersService {
  private readonly logger = new Logger(ContainersService.name);
  private docker: Dockerode;

  constructor() {
    this.docker = new Dockerode({ socketPath: '/var/run/docker.sock' });
  }

  async getContainers(): Promise<ContainerInfo[]> {
    try {
      const containers = await this.docker.listContainers({ all: true });
      return containers.map((c) => ({
        name: c.Names[0]?.replace('/', '') ?? 'unknown',
        status: c.Status,
        image: c.Image,
        state: c.State,
        uptime: c.Status,
      }));
    } catch (err) {
      this.logger.error('Docker socket error', err.message);
      return [];
    }
  }
}
