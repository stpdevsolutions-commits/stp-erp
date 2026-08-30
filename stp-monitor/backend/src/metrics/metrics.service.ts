import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import * as si from 'systeminformation';
import * as os from 'os';
import * as fs from 'fs';

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

/**
 * `si.networkStats()` (y /proc/net/dev tal cual) están namespaced por
 * contenedor en Linux — a diferencia de CPU/RAM, que sí reflejan el host
 * porque no hay límites de cgroup configurados. Sin esto, "Red" mide solo el
 * par veth interno del contenedor (unos KB) y nunca refleja el tráfico real
 * del servidor (que puede ser GB/s en la NIC física o Tailscale). Se lee
 * /hostproc/net/dev — el /proc del HOST montado aparte, sólo lectura — y se
 * suman todas las interfaces reales (se excluye loopback y todo lo que sea
 * infraestructura de Docker: docker0, br-*, veth*).
 */
const HOST_NET_DEV = '/hostproc/net/dev';
const EXCLUDED_IFACE_PREFIXES = ['lo', 'docker', 'br-', 'veth'];

function readHostNetworkTotals(logger: Logger): { rx: number; tx: number } | null {
  try {
    const content = fs.readFileSync(HOST_NET_DEV, 'utf8');
    let rx = 0;
    let tx = 0;
    for (const line of content.split('\n').slice(2)) {
      const [ifacePart, statsPart] = line.split(':');
      if (!ifacePart || !statsPart) continue;
      const iface = ifacePart.trim();
      if (EXCLUDED_IFACE_PREFIXES.some((prefix) => iface.startsWith(prefix))) continue;
      const fields = statsPart.trim().split(/\s+/).map(Number);
      rx += fields[0] || 0; // columna 1: bytes recibidos
      tx += fields[8] || 0; // columna 9: bytes transmitidos
    }
    return { rx, tx };
  } catch (err) {
    logger.warn(`No se pudo leer ${HOST_NET_DEV} (¿falta el mount de /proc del host?): ${(err as Error).message}`);
    return null;
  }
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private history: MetricsSnapshot[] = [];
  private lastNet = { rx: 0, tx: 0, ts: 0 };

  async getMetrics(): Promise<MetricsSnapshot> {
    const [load, mem, allDisks, netStatsFallback] = await Promise.all([
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

    // Red: velocidad en bytes/s usando delta desde la lectura anterior.
    // Preferimos el /proc del host (tráfico real del servidor); si el mount
    // no está (ej. dev local sin el volumen), caemos al de systeminformation
    // (solo ve el propio contenedor, pero al menos no rompe nada).
    const hostNet = readHostNetworkTotals(this.logger);
    const totalRx = hostNet ? hostNet.rx : netStatsFallback.reduce((s, n) => s + (n.rx_bytes ?? 0), 0);
    const totalTx = hostNet ? hostNet.tx : netStatsFallback.reduce((s, n) => s + (n.tx_bytes ?? 0), 0);
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
