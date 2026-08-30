import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Interval } from '@nestjs/schedule';
import { MetricsService } from '../metrics/metrics.service';
import { ServicesService } from '../services/services.service';
import { ContainersService } from '../containers/containers.service';
import { AlertsService } from '../alerts/alerts.service';
import { ProjectsService } from '../projects/projects.service';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/monitor' })
export class MonitorGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(
    private readonly metrics: MetricsService,
    private readonly services: ServicesService,
    private readonly containers: ContainersService,
    private readonly alerts: AlertsService,
    private readonly projects: ProjectsService,
  ) {}

  async handleConnection(client: Socket) {
    const payload = await this.buildPayload();
    client.emit('dashboard-update', payload);
  }

  handleDisconnect(_client: Socket) {}

  @SubscribeMessage('ping')
  handlePing() {
    return { event: 'pong', data: { ts: Date.now() } };
  }

  @Interval(5000)
  async broadcast() {
    if (!this.server) return;
    const payload = await this.buildPayload();
    this.server.emit('dashboard-update', payload);
  }

  private async buildPayload() {
    const [metrics, containers, recentAlerts, projects] = await Promise.all([
      this.metrics.getMetrics(),
      this.containers.getContainers(),
      this.alerts.getAlerts(5),
      this.projects.getAll(),
    ]);
    return {
      metrics,
      services: this.services.getStatuses(),
      containers,
      alerts: recentAlerts,
      projects,
      timestamp: new Date().toISOString(),
    };
  }
}
