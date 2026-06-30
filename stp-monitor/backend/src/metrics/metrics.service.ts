import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import * as si from 'systeminformation';
import * as os from 'os';

export interface DiskInfo {
  mount: string;
  used: number;
  total: number;
  percent: number;
}

export interface MetricsSnapshot {
  cpu: { percent: number; cores: number };
  ram: { used: number; total: number; percent: number };
  disk: { used: number; total: number; percent: number };
  disks: DiskInfo[];
  network: { rxSec: number; txSec: number };
  uptime: number;
  loadAvg: [number, number, number];
  timestamp: string;
}

const TRACKED_MOUNTS = ['/', '/data', '/storage'];

@Injectable()
export class MetricsService {
  private history: MetricsSnapshot[] = [];
  private lastNet = { rx: 0, tx: 0, ts: 0 };

  async getMetrics(): Promise<MetricsSnapshot> {
    const [load, mem, allDisks, netStats] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.networkStats(),
    ]);

    const loadAvg = os.loadavg() as [number, number, number];

    // Discos relevantes: los montajes configurados que existan
    const disks: DiskInfo[] = allDisks
      .filter((d) => TRACKED_MOUNTS.includes(d.mount) && d.size > 0)
      .map((d) => ({
        mount: d.mount,
        used: d.used,
        total: d.size,
        percent: Math.round((d.used / d.size) * 1000) / 10,
      }))
      .sort((a, b) => TRACKED_MOUNTS.indexOf(a.mount) - TRACKED_MOUNTS.indexOf(b.mount));

    const root = disks.find((d) => d.mount === '/') ?? disks[0];

    // Red: velocidad en bytes/s usando delta desde la lectura anterior
    const totalRx = netStats.reduce((s, n) => s + (n.rx_bytes ?? 0), 0);
    const totalTx = netStats.reduce((s, n) => s + (n.tx_bytes ?? 0), 0);
    const now = Date.now();
    const elapsed = this.lastNet.ts ? (now - this.lastNet.ts) / 1000 : 1;
    const rxSec = this.lastNet.ts ? Math.max(0, (totalRx - this.lastNet.rx) / elapsed) : 0;
    const txSec = this.lastNet.ts ? Math.max(0, (totalTx - this.lastNet.tx) / elapsed) : 0;
    this.lastNet = { rx: totalRx, tx: totalTx, ts: now };

    return {
      cpu: {
        percent: Math.round(load.currentLoad * 10) / 10,
        cores: os.cpus().length,
      },
      ram: {
        used: mem.active,
        total: mem.total,
        percent: Math.round((mem.active / mem.total) * 1000) / 10,
      },
      disk: root
        ? { used: root.used, total: root.total, percent: root.percent }
        : { used: 0, total: 0, percent: 0 },
      disks,
      network: { rxSec, txSec },
      uptime: os.uptime(),
      loadAvg,
      timestamp: new Date().toISOString(),
    };
  }

  @Interval(5 * 60 * 1000)
  async recordHistory() {
    const snapshot = await this.getMetrics();
    this.history.push(snapshot);
    if (this.history.length > 288) this.history.shift();
  }

  getHistory(): MetricsSnapshot[] {
    return this.history;
  }
}
