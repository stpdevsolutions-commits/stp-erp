import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { PayrollStatus } from './entities/payroll-entry.entity';

/** Solo se finge `Date` (para el mes por defecto); exceljs sigue con timers reales. */
const ONLY_DATE: { doNotFake: any[] } = {
  doNotFake: [
    'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
    'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval',
    'clearInterval', 'setTimeout', 'clearTimeout',
  ],
};

// ── PayrollService.retentionsForMonth ────────────────────────────────────────

function serviceWithQb(result: unknown[] = []) {
  const qb: any = {};
  for (const m of ['leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy']) qb[m] = jest.fn(() => qb);
  qb.getMany = jest.fn(async () => result);
  const repo = { createQueryBuilder: jest.fn(() => qb) };
  const svc = new PayrollService(repo as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  return { svc, qb, repo };
}

describe('PayrollService.retentionsForMonth', () => {
  it('filtra: estado Pagado, retención > 0 y fecha de pago dentro del mes [día 1, día 1 del mes siguiente)', async () => {
    const { svc, qb, repo } = serviceWithQb();
    await svc.retentionsForMonth('2026-03');
    expect(repo.createQueryBuilder).toHaveBeenCalledWith('p');
    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('p.collaborator', 'c');
    expect(qb.where).toHaveBeenCalledWith('p.status = :status', { status: PayrollStatus.PAID });
    expect(PayrollStatus.PAID).toBe('paid');
    expect(qb.andWhere).toHaveBeenCalledWith('p.retentionAmount > 0');
    expect(qb.andWhere).toHaveBeenCalledWith('p.paymentDate >= :from AND p.paymentDate < :to', {
      from: '2026-03-01',
      to: '2026-04-01',
    });
  });

  it('diciembre rueda al 1 de enero del año siguiente', async () => {
    const { svc, qb } = serviceWithQb();
    await svc.retentionsForMonth('2026-12');
    expect(qb.andWhere).toHaveBeenCalledWith(expect.any(String), { from: '2026-12-01', to: '2027-01-01' });
  });

  it('enero y meses de un dígito conservan el cero a la izquierda', async () => {
    const { svc, qb } = serviceWithQb();
    await svc.retentionsForMonth('2026-01');
    expect(qb.andWhere).toHaveBeenCalledWith(expect.any(String), { from: '2026-01-01', to: '2026-02-01' });
    await svc.retentionsForMonth('2026-09');
    expect(qb.andWhere).toHaveBeenCalledWith(expect.any(String), { from: '2026-09-01', to: '2026-10-01' });
  });

  it('ordena por nombre del colaborador y luego por fecha de pago, y devuelve lo que halle la consulta', async () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    const { svc, qb } = serviceWithQb(rows);
    await expect(svc.retentionsForMonth('2026-05')).resolves.toBe(rows);
    expect(qb.orderBy).toHaveBeenCalledWith('c.firstName', 'ASC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('p.paymentDate', 'ASC');
  });

  it.each([['2026-13'], ['2026-00'], ['2026-1'], ['26-05'], ['2026/05'], ['mayo'], [''], ['2026-05-01'], [' 2026-05']])(
    'mes inválido %j -> 400 y no consulta la BD',
    async (month) => {
      const { svc, repo } = serviceWithQb();
      await expect(svc.retentionsForMonth(month)).rejects.toBeInstanceOf(BadRequestException);
      await expect(svc.retentionsForMonth(month)).rejects.toThrow('AAAA-MM');
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    },
  );
});

// ── GET /payroll/export/retenciones ──────────────────────────────────────────

const pay = (over: Record<string, unknown>) => ({
  number: 'NOM-001',
  paymentDate: '2026-03-15',
  periodStart: '2026-03-01',
  periodEnd: '2026-03-15',
  grossAmount: 10000,
  retentionPercent: 10,
  retentionAmount: 1000,
  netAmount: 9000,
  collaborator: { firstName: 'Ana', lastName: 'Pérez', cedula: '001-1234567-8' },
  ...over,
});

function fakeRes() {
  const res: any = { headers: {} as Record<string, string>, body: null as Buffer | null };
  res.setHeader = jest.fn((k: string, v: string) => (res.headers[k] = v));
  res.end = jest.fn((b: Buffer) => (res.body = b));
  return res;
}

async function runExport(entries: unknown[], month?: string) {
  const payrollService = { retentionsForMonth: jest.fn(async () => entries) };
  const ctrl = new PayrollController(payrollService as never);
  const res = fakeRes();
  await ctrl.exportRetenciones(month, res);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(res.body);
  return { wb, res, payrollService };
}

/** Filas de una hoja como arreglos de valores, desde la cabecera de la tabla (la que empieza con "Cédula / RNC"). */
function table(ws: ExcelJS.Worksheet): { header: string[]; rows: any[][] } {
  const all: any[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => all.push((row.values as any[]).slice(1)));
  const h = all.findIndex((r) => r[0] === 'Cédula / RNC');
  return { header: all[h], rows: all.slice(h + 1) };
}

describe('GET /payroll/export/retenciones (Excel de retenciones)', () => {
  it('mes inválido -> 400 sin tocar el servicio', async () => {
    const payrollService = { retentionsForMonth: jest.fn() };
    const ctrl = new PayrollController(payrollService as never);
    for (const bad of ['2026-13', '2026-1', 'abc', '2026-00', '2026-05-01']) {
      await expect(ctrl.exportRetenciones(bad, fakeRes())).rejects.toThrow('AAAA-MM');
    }
    expect(payrollService.retentionsForMonth).not.toHaveBeenCalled();
  });

  it('sin mes usa el mes actual de República Dominicana (reloj falso)', async () => {
    jest.useFakeTimers(ONLY_DATE).setSystemTime(new Date('2026-07-01T02:00:00Z')); // 30-jun 22:00 en RD
    try {
      const { payrollService } = await runExport([], undefined);
      expect(payrollService.retentionsForMonth).toHaveBeenCalledWith('2026-06');
    } finally {
      jest.useRealTimers();
    }
  });

  it('cabeceras HTTP: xlsx y nombre retenciones-nomina_<mes>_<fecha>.xlsx', async () => {
    const { res } = await runExport([pay({})], '2026-03');
    expect(res.headers['Content-Type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers['Content-Disposition']).toMatch(/^attachment; filename="retenciones-nomina_2026-03_\d{4}-\d{2}-\d{2}\.xlsx"$/);
  });

  it('libro con dos hojas: "Detalle" y "Resumen por beneficiario", con el mes como filtro', async () => {
    const { wb } = await runExport([pay({})], '2026-03');
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Detalle', 'Resumen por beneficiario']);
    const texts: string[] = [];
    wb.getWorksheet('Detalle')!.eachRow((r) => texts.push(String(r.getCell(1).value ?? '')));
    expect(texts.some((t) => t.includes('Mes (por fecha de pago): 2026-03'))).toBe(true);
  });

  it('Detalle: columnas, Tipo ID 2 para cédula (11) y montos como número', async () => {
    const { wb } = await runExport([pay({})], '2026-03');
    const { header, rows } = table(wb.getWorksheet('Detalle')!);
    expect(header).toEqual([
      'Cédula / RNC', 'Tipo ID (1=RNC, 2=Cédula)', 'Beneficiario', 'Nº nómina', 'Fecha de pago',
      'Período trabajado', 'Monto bruto sujeto a retención', '% retenido', 'Retención ISR', 'Neto pagado',
    ]);
    const r = rows[0];
    expect(r[0]).toBe('00112345678'); // solo dígitos
    expect(r[1]).toBe('2');
    expect(r[2]).toBe('Ana Pérez');
    expect(r[3]).toBe('NOM-001');
    expect((r[4] as Date).toISOString().slice(0, 10)).toBe('2026-03-15');
    expect(r[5]).toBe('2026-03-01 a 2026-03-15');
    expect([r[6], r[7], r[8], r[9]]).toEqual([10000, 10, 1000, 9000]);
  });

  it('Tipo ID: 9 dígitos = 1 (RNC), 11 = 2 (cédula), otra longitud = vacío', async () => {
    const mk = (cedula: string) => pay({ collaborator: { firstName: 'X', lastName: 'Y', cedula } });
    const { wb } = await runExport([mk('101-09916-1'), mk('001-1234567-8'), mk('12345')], '2026-03');
    const { rows } = table(wb.getWorksheet('Detalle')!);
    expect(rows.slice(0, 3).map((r) => [r[0], r[1] || null])).toEqual([
      ['101099161', '1'],
      ['00112345678', '2'],
      ['12345', null],
    ]);
  });

  it('sin cédula (nula, vacía o sin colaborador) muestra "SIN CÉDULA" y beneficiario "—" si no hay colaborador', async () => {
    const { wb } = await runExport(
      [
        pay({ collaborator: { firstName: 'Beto', lastName: 'Gil', cedula: null } }),
        pay({ collaborator: { firstName: 'Carla', lastName: 'Ruiz', cedula: '' } }),
        pay({ collaborator: null }),
      ],
      '2026-03',
    );
    const { rows } = table(wb.getWorksheet('Detalle')!);
    expect(rows.slice(0, 3).map((r) => [r[0], r[1] || null, r[2]])).toEqual([
      ['SIN CÉDULA', null, 'Beto Gil'],
      ['SIN CÉDULA', null, 'Carla Ruiz'],
      ['SIN CÉDULA', null, '—'],
    ]);
  });

  it('fila de totales: suma bruto, retención y neto (no suma % ni texto)', async () => {
    const { wb } = await runExport(
      [
        pay({ grossAmount: 10000.1, retentionAmount: 1000.01, netAmount: 9000.09 }),
        pay({ number: 'NOM-002', grossAmount: 5000.2, retentionAmount: 500.02, netAmount: 4500.18 }),
      ],
      '2026-03',
    );
    const { rows } = table(wb.getWorksheet('Detalle')!);
    expect(rows).toHaveLength(3); // 2 pagos + totales
    const t = rows[2];
    expect(t[0]).toBe('TOTAL');
    expect(t[6]).toBe(15000.3);
    expect(t[7] ?? null).toBeNull();
    expect(t[8]).toBe(1500.03);
    expect(t[9]).toBe(13500.27);
  });

  it('Resumen: agrupa por cédula (varios pagos de una persona), cuenta pagos y suma montos', async () => {
    const { wb } = await runExport(
      [
        pay({ number: 'N1', grossAmount: 10000, retentionAmount: 1000, netAmount: 9000 }),
        pay({ number: 'N2', grossAmount: 4000, retentionAmount: 400, netAmount: 3600, collaborator: { firstName: 'Ana', lastName: 'Pérez', cedula: '00112345678' } }),
        pay({ number: 'N3', grossAmount: 2000, retentionAmount: 200, netAmount: 1800, collaborator: { firstName: 'Luis', lastName: 'Mora', cedula: '101099161' } }),
      ],
      '2026-03',
    );
    const { header, rows } = table(wb.getWorksheet('Resumen por beneficiario')!);
    expect(header).toEqual(['Cédula / RNC', 'Tipo ID (1=RNC, 2=Cédula)', 'Beneficiario', 'Pagos', 'Monto bruto', 'Retención ISR', 'Neto pagado']);
    expect(rows[0]).toEqual(['00112345678', '2', 'Ana Pérez', 2, 14000, 1400, 12600]);
    expect(rows[1]).toEqual(['101099161', '1', 'Luis Mora', 1, 2000, 200, 1800]);
    expect(rows[2][0]).toBe('TOTAL');
    expect(rows[2].slice(4)).toEqual([16000, 1600, 14400]);
  });

  it('Resumen: sin cédula agrupa por nombre (dos personas sin cédula no se mezclan)', async () => {
    const sin = (n: string) => pay({ collaborator: { firstName: n, lastName: 'Z', cedula: null } });
    const { wb } = await runExport([sin('Uno'), sin('Dos'), sin('Uno')], '2026-03');
    const { rows } = table(wb.getWorksheet('Resumen por beneficiario')!);
    expect(rows.slice(0, 2).map((r) => [r[0], r[2], r[3]])).toEqual([
      ['SIN CÉDULA', 'Uno Z', 2],
      ['SIN CÉDULA', 'Dos Z', 1],
    ]);
  });

  it('sin pagos genera hojas válidas: sin filas de datos, solo TOTAL en cero', async () => {
    const { wb } = await runExport([], '2026-03');
    const det = table(wb.getWorksheet('Detalle')!).rows;
    expect(det).toHaveLength(1);
    expect([det[0][0], det[0][6], det[0][8], det[0][9]]).toEqual(['TOTAL', 0, 0, 0]);
    const res = table(wb.getWorksheet('Resumen por beneficiario')!).rows;
    expect(res).toHaveLength(1);
    expect(res[0][0]).toBe('TOTAL');
  });
});
