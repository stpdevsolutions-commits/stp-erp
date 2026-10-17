/* eslint-disable */
/**
 * Prueba de integración del reparto de facturas (ERP-81) contra un PostgreSQL REAL y vacío.
 * Corre las migraciones de verdad (incluida CreateFiscalInvoiceSplits, con su down) y el servicio
 * con repositorios reales. Se SALTA sola si no hay base: para correrla,
 *
 *   ERP81_PG_HOST=<carpeta del socket o host> [ERP81_PG_PORT=5432] ERP81_PG_DB=erp81 npx jest fiscal-invoices.splits.pg
 *
 * Nunca la apuntes a una base con datos: crea y borra proyectos, gastos y facturas de prueba.
 */
import 'reflect-metadata';
import { DataSource, In } from 'typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AppDataSource } from '../data-source';
import { FiscalInvoice } from './entities/fiscal-invoice.entity';
import { FiscalInvoiceSplit } from './entities/fiscal-invoice-split.entity';
import { FiscalInvoicesService } from './fiscal-invoices.service';
import { Expense } from '../expenses/entities/expense.entity';
import { Project } from '../projects/entities/project.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Client } from '../clients/entities/client.entity';
import { toRow606 } from './form-606';

/** Sin usuario: createdById es una llave foránea a users y la base de prueba está vacía. */
const NO_USER = null as any;
const HOST = process.env.ERP81_PG_HOST;
const maybe = HOST ? describe : describe.skip;

maybe('FiscalInvoicesService — reparto entre proyectos (ERP-81) contra PostgreSQL', () => {
  let ds: DataSource;
  let service: FiscalInvoicesService;
  let expensesFake: any;
  let pA: Project;
  let pB: Project;
  let seq = 0;

  const expRepo = () => ds.getRepository(Expense);
  const invRepo = () => ds.getRepository(FiscalInvoice);
  const splitRepo = () => ds.getRepository(FiscalInvoiceSplit);

  beforeAll(async () => {
    ds = new DataSource({
      ...(AppDataSource.options as any),
      url: undefined,
      host: HOST,
      port: Number(process.env.ERP81_PG_PORT ?? 5432),
      username: 'postgres',
      database: process.env.ERP81_PG_DB ?? 'erp81',
      migrations: [__dirname + '/../migrations/*.ts'],
      migrationsRun: false,
      logging: false,
    });
    await ds.initialize();
    await ds.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    // La migración AddCollaboratorTypeAndCode1792000000000 revienta en una base VACÍA (setval(seq, 0)
    // con la secuencia en mínimo 1): fallo viejo y ajeno a ERP-81. Se evita creando esa secuencia
    // con mínimo 0; en producción no pasa porque ya hay colaboradores (y la migración ya corrió).
    await ds.query('CREATE SEQUENCE IF NOT EXISTS "collaborators_code_seq_fixed" MINVALUE 0 START 0');
    await ds.runMigrations();

    const client: Client = await ds.getRepository(Client).save({ name: 'Cliente prueba' } as any);
    pA = await ds.getRepository(Project).save(ds.getRepository(Project).create({ code: 'PRJ-A', name: 'Proyecto A', clientId: client.id } as any) as any);
    pB = await ds.getRepository(Project).save(ds.getRepository(Project).create({ code: 'PRJ-B', name: 'Proyecto B', clientId: client.id } as any) as any);

    // ExpensesService de mentira: escribe en la misma base; los ganchos accesorios no hacen nada.
    expensesFake = {
      create: jest.fn(async (dto: any, createdById: string) => expRepo().save(expRepo().create({ ...dto, createdById }))),
      update: jest.fn(async (id: string, dto: any) => {
        await expRepo().update(id, dto);
        return expRepo().findOneByOrFail({ id });
      }),
      remove: jest.fn(async (id: string) => void (await expRepo().delete(id))),
      refreshPdf: jest.fn(async () => undefined),
      voidDerivedPrices: jest.fn(async () => undefined),
      cleanupRemoved: jest.fn(async () => undefined),
    };
    service = new FiscalInvoicesService(
      invRepo(),
      {} as any,
      { getCompanyData: jest.fn(async () => ({ rnc: '132943058' })) } as any,
      expensesFake,
      ds.getRepository(Supplier),
      expRepo(),
      {} as any,
      splitRepo(),
      ds,
    );
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
  });

  /** Factura de RD$1,180.00 (1,000 + 180 de ITBIS) con NCF distinto cada vez. */
  const newInvoice = async (extra: Record<string, unknown> = {}) =>
    service.create(
      {
        ncf: `B01${String(++seq).padStart(8, '0')}`,
        supplierRnc: '130991873',
        supplierName: 'FERRETERIA UNO SRL',
        baseAmount: 1000,
        itbis: 180,
        expenseType: '09',
        invoiceDate: '2026-10-05',
        ...extra,
      } as any,
      null as any,
    );

  const expensesOf = async (invoiceId: string): Promise<Expense[]> => {
    const splits = await splitRepo().find({ where: { fiscalInvoiceId: invoiceId } });
    const inv = await invRepo().findOneByOrFail({ id: invoiceId });
    const ids = [...splits.map((s) => s.expenseId), inv.expenseId].filter((x): x is string => !!x);
    return ids.length ? expRepo().find({ where: { id: In(ids) } }) : [];
  };
  const total = (rows: Expense[]) => Math.round(rows.reduce((a, e) => a + Number(e.amount) * 100, 0)) / 100;

  it('migración: la tabla existe, el down la quita y el up la vuelve a crear', async () => {
    const exists = async () => (await ds.query(`SELECT to_regclass('public.fiscal_invoice_splits') AS t`))[0].t !== null;
    expect(await exists()).toBe(true);
    await ds.undoLastMigration();
    expect(await exists()).toBe(false);
    await ds.runMigrations();
    expect(await exists()).toBe(true);
  });

  it('una factura sin dividir sigue igual: un gasto, sin líneas', async () => {
    const inv = await newInvoice({ projectId: pA.id });
    expect(inv.expenseId).toBeTruthy();
    expect(inv.splits).toEqual([]);
    expect(await expRepo().countBy({ projectId: pA.id })).toBe(1);
  });

  it('divide una factura sin dividir: 3 gastos (A, B y general) y el gasto único se reutiliza', async () => {
    const inv = await newInvoice({ projectId: pA.id });
    const before = inv.expenseId!;
    const res = await service.setSplits(
      inv.id,
      [
        { projectId: pA.id, amount: 400, note: 'cable' },
        { projectId: pB.id, amount: 300.5 },
        { projectId: null, amount: 479.5, note: 'herramienta de la oficina' },
      ],
      NO_USER,
    );

    expect(res.expenseId).toBeNull();
    expect(res.totalAmount).toBe(1180);
    expect(res.splits).toHaveLength(3);
    expect(res.splits!.map((s) => s.projectId)).toEqual([pA.id, pB.id, null]);
    const exps = await expensesOf(inv.id);
    expect(exps).toHaveLength(3);
    expect(total(exps)).toBe(1180);
    const byProject = (pid: string | null) => exps.find((e) => e.projectId === pid)!;
    expect(byProject(pA.id).amount).toBe(400);
    expect(byProject(pA.id).id).toBe(before); // reutilizado, no recreado
    expect(byProject(pB.id).amount).toBe(300.5);
    expect(byProject(null).amount).toBe(479.5);
    expect(byProject(pB.id)).toMatchObject({ category: 'materials', date: '2026-10-05', description: 'FERRETERIA UNO SRL — ' + inv.ncf });
    expect(byProject(pB.id).supplierId).toBeTruthy();
    // Nada huérfano: no quedó ningún gasto de esta factura fuera de las líneas.
    expect(await expRepo().countBy({ description: 'FERRETERIA UNO SRL — ' + inv.ncf })).toBe(3);
  });

  it('un reparto que no cuadra se rechaza sin tocar nada', async () => {
    const inv = await newInvoice({ projectId: pA.id });
    await expect(service.setSplits(inv.id, [{ projectId: pA.id, amount: 1000 }, { projectId: null, amount: 100 }], NO_USER)).rejects.toThrow(/Falta RD\$ 80\.00/);
    await expect(service.setSplits(inv.id, [{ projectId: pA.id, amount: 1180.01 }], NO_USER)).rejects.toThrow(/Sobra RD\$ 0\.01/);
    const after = await invRepo().findOneByOrFail({ id: inv.id });
    expect(after.expenseId).toBe(inv.expenseId);
    expect(await splitRepo().countBy({ fiscalInvoiceId: inv.id })).toBe(0);
    expect(await expRepo().countBy({ description: 'FERRETERIA UNO SRL — ' + inv.ncf })).toBe(1);
  });

  it('un proyecto que no existe da 400 y no escribe nada', async () => {
    const inv = await newInvoice({ projectId: null });
    await expect(
      service.setSplits(inv.id, [{ projectId: '99999999-9999-4999-8999-999999999999', amount: 1180 }], NO_USER),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await expRepo().countBy({ description: 'FERRETERIA UNO SRL — ' + inv.ncf })).toBe(1);
  });

  it('el mismo destino repetido se fusiona en una línea', async () => {
    const inv = await newInvoice({ projectId: null });
    const res = await service.setSplits(
      inv.id,
      [
        { projectId: pA.id, amount: 500, note: 'a' },
        { projectId: pB.id, amount: 180 },
        { projectId: pA.id, amount: 500, note: 'b' },
      ],
      NO_USER,
    );
    expect(res.splits).toHaveLength(2);
    expect(res.splits!.find((s) => s.projectId === pA.id)).toMatchObject({ amount: 1000, note: 'a; b' });
  });

  it('volver a dividir cambia las líneas sin duplicar: lo que sale se borra, lo que se repite se conserva', async () => {
    const inv = await newInvoice({ projectId: pA.id });
    await service.setSplits(inv.id, [{ projectId: pA.id, amount: 600 }, { projectId: pB.id, amount: 300 }, { projectId: null, amount: 280 }], NO_USER);
    const first = await expensesOf(inv.id);
    const keptB = first.find((e) => e.projectId === pB.id)!.id;

    await service.setSplits(inv.id, [{ projectId: pB.id, amount: 1000 }, { projectId: pA.id, amount: 180 }], NO_USER);
    const exps = await expensesOf(inv.id);
    expect(exps).toHaveLength(2);
    expect(total(exps)).toBe(1180);
    expect(exps.find((e) => e.projectId === pB.id)!.id).toBe(keptB);
    expect(first.find((e) => e.projectId === null)).toBeDefined();
    expect(await expRepo().countBy({ id: first.find((e) => e.projectId === null)!.id })).toBe(0); // el general se borró
    expect(await expRepo().countBy({ description: 'FERRETERIA UNO SRL — ' + inv.ncf })).toBe(2);
  });

  it('transacción: si algo falla a mitad del guardado, queda todo como estaba', async () => {
    const inv = await newInvoice({ projectId: pA.id });
    await service.setSplits(inv.id, [{ projectId: pA.id, amount: 600 }, { projectId: pB.id, amount: 300 }, { projectId: null, amount: 280 }], NO_USER);
    const antes = (await expensesOf(inv.id)).map((e) => `${e.id}:${e.projectId}:${e.amount}`).sort();

    // El borrado del gasto sobrante (último paso de la transacción) revienta.
    expensesFake.voidDerivedPrices.mockRejectedValueOnce(new Error('falla simulada'));
    await expect(service.setSplits(inv.id, [{ projectId: pA.id, amount: 1180 }], NO_USER)).rejects.toThrow('falla simulada');

    const despues = (await expensesOf(inv.id)).map((e) => `${e.id}:${e.projectId}:${e.amount}`).sort();
    expect(despues).toEqual(antes);
    expect(await splitRepo().countBy({ fiscalInvoiceId: inv.id })).toBe(3);
    expect((await invRepo().findOneByOrFail({ id: inv.id })).expenseId).toBeNull();
  });

  it('una sola línea deja la factura sin dividir, con ese destino y un único gasto', async () => {
    const inv = await newInvoice({ projectId: pA.id });
    await service.setSplits(inv.id, [{ projectId: pA.id, amount: 600 }, { projectId: pB.id, amount: 580 }], NO_USER);
    const res = await service.setSplits(inv.id, [{ projectId: pB.id, amount: 1180 }], NO_USER);
    expect(res.splits).toEqual([]);
    expect(res.expenseId).toBeTruthy();
    const exps = await expensesOf(inv.id);
    expect(exps).toHaveLength(1);
    expect(exps[0]).toMatchObject({ projectId: pB.id, amount: 1180 });
    expect(await expRepo().countBy({ description: 'FERRETERIA UNO SRL — ' + inv.ncf })).toBe(1);
  });

  it('asignar una factura dividida a un solo destino la deja sin dividir (assign)', async () => {
    const inv = await newInvoice({ projectId: pA.id });
    await service.setSplits(inv.id, [{ projectId: pA.id, amount: 600 }, { projectId: null, amount: 580 }], NO_USER);
    await service.assign([inv.id], pB.id, NO_USER);
    const after = await service.findOne(inv.id);
    expect(after.splits).toEqual([]);
    expect(after.expense?.projectId).toBe(pB.id);
    expect(await expRepo().countBy({ description: 'FERRETERIA UNO SRL — ' + inv.ncf })).toBe(1);
  });

  it('no se puede dividir una factura vinculada a mano a un gasto que ya existía (evita contar dos veces)', async () => {
    const manual = await expRepo().save(
      expRepo().create({ description: 'compra manual', amount: 1180, date: '2026-10-05', projectId: pA.id } as any) as any,
    );
    const inv = await newInvoice({ expenseId: (manual as any).id });
    expect((await invRepo().findOneByOrFail({ id: inv.id })).expenseOwned).toBe(false);
    await expect(service.setSplits(inv.id, [{ projectId: pA.id, amount: 1000 }, { projectId: null, amount: 180 }], NO_USER)).rejects.toBeInstanceOf(ConflictException);
    expect(await expRepo().countBy({ id: (manual as any).id })).toBe(1);
  });

  it('cambiar el total de una factura dividida se rechaza; cambiar otros datos sincroniza los gastos', async () => {
    const inv = await newInvoice({ projectId: null });
    await service.setSplits(inv.id, [{ projectId: pA.id, amount: 1000 }, { projectId: null, amount: 180 }], NO_USER);
    await expect(service.update(inv.id, { baseAmount: 2000 } as any, NO_USER)).rejects.toBeInstanceOf(ConflictException);
    await service.update(inv.id, { invoiceDate: '2026-10-07' } as any, NO_USER);
    const exps = await expensesOf(inv.id);
    expect(exps.every((e) => e.date === '2026-10-07')).toBe(true);
    expect(total(exps)).toBe(1180);
  });

  it('listado y filtros ven el reparto; la suma del listado no se duplica', async () => {
    const inv = await newInvoice({ projectId: null });
    await service.setSplits(inv.id, [{ projectId: pA.id, amount: 700 }, { projectId: null, amount: 480 }], NO_USER);

    const all = await service.findAll({ search: inv.ncf } as any);
    expect(all.total).toBe(1);
    expect(all.totalAmount).toBe(1180);
    expect(all.data[0].splits).toHaveLength(2);

    const ids = async (q: any) => (await service.findAll({ search: inv.ncf, ...q } as any)).data.map((f) => f.id);
    expect(await ids({ project: 'with' })).toEqual([inv.id]);
    expect(await ids({ project: 'without' })).toEqual([inv.id]); // tiene parte general
    expect(await ids({ projectId: pA.id })).toEqual([inv.id]);
    expect(await ids({ projectId: pB.id })).toEqual([]);
    expect(await ids({ assigned: 'assigned' })).toEqual([inv.id]);
    expect(await ids({ assigned: 'unassigned' })).toEqual([]);
  });

  it('las partes no se ofrecen para vincular ni a la conciliación', async () => {
    const inv = await newInvoice({ projectId: null });
    await service.setSplits(inv.id, [{ projectId: pA.id, amount: 700 }, { projectId: null, amount: 480 }], NO_USER);
    expect(await service.candidatesForInvoice(inv.id)).toEqual([]);
    const rec = await service.reconciliation();
    expect(rec.items.find((i) => i.invoice.id === inv.id)).toBeUndefined();
    const parts = await splitRepo().find({ where: { fiscalInvoiceId: inv.id } });
    expect((await service.findByExpense(parts[0].expenseId!)).id).toBe(inv.id);
    await expect(service.linkExpense(inv.id, parts[0].expenseId!, NO_USER)).rejects.toBeInstanceOf(ConflictException);
  });

  it('el 606 no cambia: la factura sale entera, una fila, con su NCF y total', async () => {
    const inv = await newInvoice({ projectId: null });
    const antes = toRow606(await service.findOne(inv.id));
    await service.setSplits(inv.id, [{ projectId: pA.id, amount: 700 }, { projectId: pB.id, amount: 300 }, { projectId: null, amount: 180 }], NO_USER);
    const rows = (await service.findForExport({ search: inv.ncf } as any)).map(toRow606);
    expect(rows).toHaveLength(1);
    expect({ ...rows[0], proyecto: '' }).toEqual({ ...antes, proyecto: '' });
    expect(rows[0].totalGeneral).toBe(1180);
    expect(rows[0].proyecto).toBe('PRJ-A, PRJ-B, General');
  });

  it('borrar la factura dividida borra sus líneas y los gastos que nacieron de ella', async () => {
    const inv = await newInvoice({ projectId: null });
    await service.setSplits(inv.id, [{ projectId: pA.id, amount: 700 }, { projectId: null, amount: 480 }], NO_USER);
    const ids = (await expensesOf(inv.id)).map((e) => e.id);
    expect(ids).toHaveLength(2);
    await service.remove(inv.id, NO_USER);
    expect(await invRepo().countBy({ id: inv.id })).toBe(0);
    expect(await splitRepo().countBy({ fiscalInvoiceId: inv.id })).toBe(0);
    expect(await expRepo().countBy({ description: 'FERRETERIA UNO SRL — ' + inv.ncf })).toBe(0);
  });

  it('borrar a mano el gasto de una línea conserva el reparto, y guardar de nuevo lo regenera', async () => {
    const inv = await newInvoice({ projectId: null });
    await service.setSplits(inv.id, [{ projectId: pA.id, amount: 700 }, { projectId: null, amount: 480 }], NO_USER);
    const parts = await splitRepo().find({ where: { fiscalInvoiceId: inv.id } });
    await expRepo().delete(parts[0].expenseId!);
    expect(await splitRepo().countBy({ fiscalInvoiceId: inv.id })).toBe(2);
    expect((await splitRepo().findOneByOrFail({ id: parts[0].id })).expenseId).toBeNull();
    await service.setSplits(inv.id, [{ projectId: pA.id, amount: 700 }, { projectId: null, amount: 480 }], NO_USER);
    expect(await expensesOf(inv.id)).toHaveLength(2);
  });

  it('un proyecto con reparto no se puede borrar por debajo (RESTRICT)', async () => {
    const inv = await newInvoice({ projectId: null });
    await service.setSplits(inv.id, [{ projectId: pB.id, amount: 700 }, { projectId: null, amount: 480 }], NO_USER);
    await expect(ds.query('DELETE FROM projects WHERE id = $1', [pB.id])).rejects.toThrow();
  });
});
