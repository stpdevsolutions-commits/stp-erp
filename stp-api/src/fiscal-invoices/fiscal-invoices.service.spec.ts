/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FiscalInvoicesService } from './fiscal-invoices.service';

const PROJECT = '11111111-1111-4111-8111-111111111111';

/** Un repositorio en memoria y dobles de ExpensesService/proveedores, sin base de datos. */
function build(opts: { existingSupplierId?: string; expenseCreate?: () => Promise<any>; manualExpenses?: string[] } = {}) {
  const store = new Map<string, any>();
  let seq = 0;

  const repo = {
    create: jest.fn((o: any) => ({ ...o })),
    save: jest.fn(async (o: any) => {
      const row = { ...o, id: o.id ?? `inv-${++seq}`, expenseId: o.expenseId ?? null, expenseOwned: o.expenseOwned ?? true, photoPath: null };
      store.set(row.id, row);
      return row;
    }),
    findOne: jest.fn(async ({ where }: any) => {
      const rows = [...store.values()];
      if (where.id) return store.get(where.id) ?? null;
      if (where.expenseId) return rows.find((r) => r.expenseId === where.expenseId) ?? null;
      return rows.find((r) => r.supplierRnc === where.supplierRnc && r.ncf === where.ncf) ?? null;
    }),
    update: jest.fn(async (id: string, patch: any) => void store.set(id, { ...store.get(id), ...patch })),
    delete: jest.fn(async (id: string) => void store.delete(id)),
    remove: jest.fn(async (row: any) => void store.delete(row.id)),
    find: jest.fn(async ({ where }: any) =>
      [...store.values()]
        .filter((r) => r.supplierRnc === where.supplierRnc)
        .sort((a, b) => String(b.invoiceDate).localeCompare(String(a.invoiceDate))),
    ),
  };
  const expenses = {
    create: jest.fn(opts.expenseCreate ?? (async (dto: any) => ({ id: 'exp-1', ...dto }))),
    update: jest.fn(async () => ({})),
    remove: jest.fn(async () => undefined),
  };
  const supplierQb = {
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(async () => (opts.existingSupplierId ? { id: opts.existingSupplierId } : null)),
  };
  const suppliers = {
    createQueryBuilder: jest.fn(() => supplierQb),
    create: jest.fn((o: any) => o),
    save: jest.fn(async (o: any) => ({ id: 'sup-new', ...o })),
  };

  // Gastos tecleados a mano que ya existen (ERP-50).
  const expenseRepo = {
    findOne: jest.fn(async ({ where }: any) => ((opts.manualExpenses ?? []).includes(where.id) ? { id: where.id } : null)),
  };

  const scanner = { read: jest.fn(async () => ({ raw: {}, provider: 'gemini' })) };
  const dgii = {
    fetchTimbre: jest.fn(async (): Promise<any> => null),
    lookupRnc: jest.fn(async (): Promise<any> => ({ found: true, rnc: '', name: 'EMISOR POR RNC' })),
    checkComprobante: jest.fn(async (): Promise<any> => ({ verdict: 'unknown', estado: null, message: '', isEcf: true })),
  };
  const settings = { getCompanyData: jest.fn(async () => ({ rnc: '132943058' })) };
  // Reparto de la factura (ERP-81): estas pruebas son de facturas sin dividir, así que no hay líneas.
  const splitRepo = { find: jest.fn(async () => []), findOne: jest.fn(async () => null) };
  const dataSource = { transaction: jest.fn() };
  const service = new FiscalInvoicesService(repo as any, dgii as any, settings as any, expenses as any, suppliers as any, expenseRepo as any, scanner as any, splitRepo as any, dataSource as any);
  return { service, repo, expenses, suppliers, store, scanner, dgii, settings, expenseRepo, splitRepo, dataSource };
}

const dto = (over: Record<string, unknown> = {}) =>
  ({
    ncf: 'B0100000012',
    supplierRnc: '130991873',
    supplierName: 'FERRETERIA UNO SRL',
    baseAmount: 1000,
    itbis: 180,
    expenseType: '09',
    invoiceDate: '2026-10-05',
    ...over,
  }) as any;

describe('FiscalInvoicesService — factura → gasto (ERP-39)', () => {
  it('sin destino no crea gasto ni proveedor: la factura cuenta solo para el 606', async () => {
    const { service, expenses, suppliers } = build();
    const inv = await service.create(dto(), 'user-1');
    expect(inv.totalAmount).toBe(1180);
    expect(expenses.create).not.toHaveBeenCalled();
    expect(suppliers.save).not.toHaveBeenCalled();
    expect(inv.expenseId).toBeNull();
  });

  it('con projectId null crea un gasto GENERAL, con el proveedor nuevo creado por RNC', async () => {
    const { service, expenses, suppliers } = build();
    const inv = await service.create(dto({ projectId: null }), 'user-1');

    expect(suppliers.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'FERRETERIA UNO SRL', rnc: '130991873' }));
    expect(expenses.create).toHaveBeenCalledTimes(1);
    const [payload, userId] = expenses.create.mock.calls[0] as any[];
    expect(payload).toMatchObject({
      projectId: null,
      description: 'FERRETERIA UNO SRL — B0100000012',
      category: 'materials', // tipo 09
      amount: 1180,
      date: '2026-10-05',
      supplierId: 'sup-new',
      notes: 'Factura B0100000012',
    });
    expect(userId).toBe('user-1');
    expect(inv.expenseId).toBe('exp-1');
  });

  it('con un proyecto crea el gasto en ese proyecto y reutiliza el proveedor existente', async () => {
    const { service, expenses, suppliers } = build({ existingSupplierId: 'sup-9' });
    await service.create(dto({ projectId: PROJECT, notes: 'cable' }), 'user-1');
    expect(suppliers.save).not.toHaveBeenCalled();
    expect(expenses.create.mock.calls[0][0]).toMatchObject({
      projectId: PROJECT,
      supplierId: 'sup-9',
      notes: 'Factura B0100000012. cable',
    });
  });

  it('si el gasto no se puede crear, la factura tampoco queda', async () => {
    const { service, repo, store } = build({
      expenseCreate: async () => {
        throw new Error('monto inválido');
      },
    });
    await expect(service.create(dto({ projectId: null }), 'user-1')).rejects.toThrow('monto inválido');
    expect(repo.delete).toHaveBeenCalled();
    expect(store.size).toBe(0);
  });

  it('rechaza la misma factura (RNC + NCF) dos veces', async () => {
    const { service } = build();
    await service.create(dto(), 'user-1');
    await expect(service.create(dto({ supplierName: 'otro nombre' }), 'user-1')).rejects.toBeInstanceOf(ConflictException);
  });

  describe('editar', () => {
    it('sincroniza el gasto con el nuevo monto, sin tocar su proyecto', async () => {
      const { service, expenses } = build();
      const inv = await service.create(dto({ projectId: PROJECT }), 'user-1');
      await service.update(inv.id, { baseAmount: 2000, itbis: 360 } as any, 'user-1');

      const [expenseId, payload] = expenses.update.mock.calls[0] as any[];
      expect(expenseId).toBe('exp-1');
      expect(payload.amount).toBe(2360);
      expect('projectId' in payload).toBe(false);
    });

    it('pasa el gasto a general con projectId null', async () => {
      const { service, expenses } = build();
      const inv = await service.create(dto({ projectId: PROJECT }), 'user-1');
      await service.update(inv.id, { projectId: null } as any, 'user-1');
      expect((expenses.update.mock.calls[0] as any[])[1]).toMatchObject({ projectId: null });
    });

    it('una factura sin gasto lo crea al darle destino', async () => {
      const { service, expenses } = build();
      const inv = await service.create(dto(), 'user-1');
      expect(expenses.create).not.toHaveBeenCalled();
      await service.update(inv.id, { projectId: PROJECT } as any, 'user-1');
      expect(expenses.create).toHaveBeenCalledTimes(1);
      expect((expenses.create.mock.calls[0] as any[])[0]).toMatchObject({ projectId: PROJECT });
    });

    it('editar una factura sin gasto y sin destino no crea nada', async () => {
      const { service, expenses } = build();
      const inv = await service.create(dto(), 'user-1');
      await service.update(inv.id, { notes: 'x' } as any, 'user-1');
      expect(expenses.create).not.toHaveBeenCalled();
      expect(expenses.update).not.toHaveBeenCalled();
    });

    it('el destino no se escribe en la tabla de facturas (no es una columna suya)', async () => {
      const { service, repo } = build();
      const inv = await service.create(dto({ projectId: PROJECT }), 'user-1');
      await service.update(inv.id, { projectId: null, notes: 'n' } as any, 'user-1');
      for (const call of repo.update.mock.calls as any[][]) {
        expect('projectId' in call[1]).toBe(false);
      }
    });
  });

  describe('eliminar', () => {
    it('borra también el gasto que originó la factura', async () => {
      const { service, expenses } = build();
      const inv = await service.create(dto({ projectId: null }), 'user-1');
      await service.remove(inv.id, 'admin-1');
      expect(expenses.remove).toHaveBeenCalledWith('exp-1', 'admin-1');
    });

    it('si el gasto no se puede borrar, la factura igual se elimina', async () => {
      const { service, expenses, store } = build();
      const inv = await service.create(dto({ projectId: null }), 'user-1');
      expenses.remove.mockRejectedValueOnce(new Error('boom'));
      await expect(service.remove(inv.id, 'admin-1')).resolves.toBeUndefined();
      expect(store.has(inv.id)).toBe(false);
    });

    it('una factura sin gasto no toca Gastos', async () => {
      const { service, expenses } = build();
      const inv = await service.create(dto(), 'user-1');
      await service.remove(inv.id, 'admin-1');
      expect(expenses.remove).not.toHaveBeenCalled();
    });
  });

  describe('asignar en bloque', () => {
    it('asigna varias y cuenta cuántas fallaron sin frenar a las demás', async () => {
      const { service, expenses } = build();
      const a = await service.create(dto({ ncf: 'B0100000001' }), 'u');
      const b = await service.create(dto({ ncf: 'B0100000002' }), 'u');
      const c = await service.create(dto({ ncf: 'B0100000003' }), 'u');
      // la segunda llamada a crear gasto falla
      expenses.create
        .mockImplementationOnce(async (d: any) => ({ id: 'e1', ...d }))
        .mockImplementationOnce(async () => {
          throw new Error('sin permiso');
        })
        .mockImplementationOnce(async (d: any) => ({ id: 'e3', ...d }));

      const r = await service.assign([a.id, b.id, c.id], PROJECT, 'u');
      expect(r.updated).toBe(2);
      expect(r.failed).toEqual([{ id: b.id, error: 'sin permiso' }]);
    });

    it('una factura que no existe se informa como fallida', async () => {
      const { service } = build();
      const r = await service.assign(['no-existe'], null, 'u');
      expect(r.updated).toBe(0);
      expect(r.failed[0].id).toBe('no-existe');
    });
  });

  describe('escanear (ERP-36)', () => {
    const PNG = Buffer.from('\x89PNG\r\n\x1a\n', 'binary');
    const lectura = (over: Record<string, unknown> = {}) => ({
      raw: {
        supplierName: 'FERRETERIA UNO SRL', supplierRnc: '130991873', ncf: 'B0100000012', invoiceDate: '2026-10-05',
        baseAmount: 1000, itbis: 180, totalAmount: 1180, paymentMethod: '01', expenseType: '09', confidence: 'high', missing: [],
        ...over,
      },
      provider: 'gemini',
    });

    it('devuelve los campos sugeridos y NO guarda nada', async () => {
      const { service, scanner, repo, expenses } = build();
      scanner.read.mockResolvedValueOnce(lectura() as any);
      const r = await service.scan(PNG, 'image/png');
      expect(r.fields).toMatchObject({ ncf: 'B0100000012', supplierRnc: '130991873', baseAmount: 1000, expenseType: '09' });
      expect(r.duplicate).toBeNull();
      expect(r.warnings).toEqual([]);
      expect(repo.save).not.toHaveBeenCalled();
      expect(expenses.create).not.toHaveBeenCalled();
    });

    it('avisa si la factura leída ya está registrada', async () => {
      const { service, scanner } = build();
      const existing = await service.create(dto(), 'u');
      scanner.read.mockResolvedValueOnce(lectura() as any);
      const r = await service.scan(PNG, 'image/png');
      expect(r.duplicate).toMatchObject({ id: existing.id, ncf: 'B0100000012' });
      expect(r.warnings[0]).toContain('ya está registrada');
    });

    it('un archivo cuyo contenido no es del tipo que dice → 400, sin llamar al modelo', async () => {
      const { service, scanner } = build();
      await expect(service.scan(Buffer.from('no soy un png'), 'image/png')).rejects.toThrow('no coincide');
      expect(scanner.read).not.toHaveBeenCalled();
    });

    it('si el modelo falla, el error sube tal cual (503 amable)', async () => {
      const { service, scanner } = build();
      scanner.read.mockRejectedValueOnce(new Error('El servicio de escaneo no respondió'));
      await expect(service.scan(PNG, 'image/png')).rejects.toThrow('no respondió');
    });
  });

  describe('QR del e-CF y proveedores frecuentes', () => {
    const QR =
      'https://ecf.dgii.gov.do/ecf/ConsultaTimbre?RncEmisor=101099161&RncComprador=132943058&ENCF=E310000726627' +
      '&FechaEmision=05-10-2026&MontoTotal=1500.00&FechaFirma=05-10-2026%2019:42:10&CodigoSeguridad=K9m2Xq';
    const previa = (service: any, i: number, over: Record<string, unknown> = {}) =>
      service.create(
        dto({ ncf: `B010000000${i}`, supplierRnc: '101099161', supplierName: 'AMABLE ARISTY CASTRO S R L', expenseType: '09', paymentMethod: '03', ...over }),
        'u',
      );

    it('el QR llena RNC, e-NCF, fecha, total y código de seguridad, y trae nombre/ITBIS/estado de la DGII', async () => {
      const { service, dgii, repo } = build();
      dgii.fetchTimbre.mockResolvedValueOnce({ notFound: false, supplierName: 'AMABLE ARISTY CASTRO S R L', estado: 'Aceptado', itbis: 228.81, total: 1500 });
      const r = await service.fromQr(QR);

      expect(r.fields).toMatchObject({
        ncf: 'E310000726627', supplierRnc: '101099161', supplierName: 'AMABLE ARISTY CASTRO S R L',
        invoiceDate: '2026-10-05', itbis: 228.81, baseAmount: 1271.19, securityCode: 'K9m2Xq',
      });
      expect(r.totalAmount).toBe(1500);
      expect(r.estadoDgii).toBe('Aceptado');
      expect(r.source).toBe('qr');
      expect(r.warnings).toEqual([]);
      expect(repo.save).not.toHaveBeenCalled(); // leer un QR no guarda nada
    });

    it('si la DGII no responde, el QR igual sirve: nombre por el RNC, base = total y aviso del ITBIS', async () => {
      const { service, dgii } = build();
      dgii.fetchTimbre.mockResolvedValueOnce(null);
      const r = await service.fromQr(QR);
      expect(r.fields.supplierName).toBe('EMISOR POR RNC');
      expect(r.fields.baseAmount).toBe(1500);
      expect(r.fields.itbis).toBe(0);
      expect(r.warnings.join(' ')).toContain('no trae el ITBIS');
      expect(r.estadoDgii).toBeNull();
    });

    it('sin estado en la página del timbre, lo busca en el portal con el código de seguridad', async () => {
      const { service, dgii } = build();
      dgii.checkComprobante.mockResolvedValueOnce({ verdict: 'valid', estado: 'Aceptado', message: '', isEcf: true });
      const r = await service.fromQr(QR);
      expect(dgii.checkComprobante).toHaveBeenCalledWith({ rnc: '101099161', ncf: 'E310000726627', rncComprador: '132943058', codigoSeguridad: 'K9m2Xq' });
      expect(r.estadoDgii).toBe('Aceptado');
    });

    it('avisa si el comprobante está a nombre de OTRO RNC', async () => {
      const { service } = build();
      const r = await service.fromQr(QR.replace('RncComprador=132943058', 'RncComprador=101010101'));
      expect(r.warnings.join(' ')).toContain('otro RNC');
    });

    it('avisa si la DGII dice que no encontró el comprobante', async () => {
      const { service, dgii } = build();
      dgii.fetchTimbre.mockResolvedValueOnce({ notFound: true });
      expect((await service.fromQr(QR)).warnings.join(' ')).toContain('no encontró este comprobante');
    });

    it('un QR que no es de la DGII → 400 y NO se consulta nada', async () => {
      const { service, dgii } = build();
      await expect(service.fromQr('https://evil.example.com/?RncEmisor=101099161&ENCF=E310000726627')).rejects.toThrow('no es de la DGII');
      expect(dgii.fetchTimbre).not.toHaveBeenCalled();
    });

    it('un QR de una factura ya registrada avisa y trae el duplicado', async () => {
      const { service } = build();
      await previa(service, 1, { ncf: 'E310000726627' });
      const r = await service.fromQr(QR);
      expect(r.duplicate?.ncf).toBe('E310000726627');
      expect(r.warnings[0]).toContain('ya está registrada');
    });

    it('proveedor frecuente: toma el tipo de gasto y la forma de pago de sus facturas anteriores', async () => {
      const { service } = build();
      await previa(service, 1);
      await previa(service, 2);
      await previa(service, 3);
      const r = await service.fromQr(QR);
      expect(r.fields.expenseType).toBe('09');
      expect(r.fields.paymentMethod).toBe('03');
      expect(r.hints.join(' ')).toContain('Proveedor conocido');
      expect(r.hints.join(' ')).toContain('3 factura');
    });

    it('proveedor nuevo: no inventa nada', async () => {
      const { service } = build();
      const r = await service.fromQr(QR);
      expect(r.fields.expenseType).toBeNull();
      expect(r.fields.paymentMethod).toBe('01');
      expect(r.hints).toEqual([]);
    });

    it('la lectura con IA también aplica el hábito (cuando el modelo no sabe la forma de pago)', async () => {
      const { service, scanner } = build();
      await previa(service, 1);
      await previa(service, 2);
      scanner.read.mockResolvedValueOnce({
        raw: { supplierName: 'AMABLE', supplierRnc: '101099161', ncf: 'B0100000099', invoiceDate: '2026-10-05', baseAmount: 100, itbis: 18, totalAmount: 118, paymentMethod: '01', expenseType: '02', confidence: 'high', missing: [] },
        provider: 'gemini',
      } as any);
      const r = await service.scan(Buffer.from('\x89PNG\r\n\x1a\n', 'binary'), 'image/png');
      expect(r.fields.expenseType).toBe('09'); // el hábito (2 de 2) manda sobre lo que adivinó el modelo
      expect(r.fields.paymentMethod).toBe('03');
      expect(r.source).toBe('ia');
    });

    it('suggest: devuelve lo habitual del proveedor y su nombre', async () => {
      const { service } = build();
      await previa(service, 1);
      await previa(service, 2, { expenseType: '02' });
      await previa(service, 3);
      expect(await service.suggest('1-01-09916-1')).toEqual({
        count: 3, supplierName: 'AMABLE ARISTY CASTRO S R L',
        expenseType: '09', expenseTypeShare: 2 / 3, paymentMethod: '03', paymentMethodShare: 1,
      });
    });

    it('suggest: un proveedor sin facturas devuelve ceros; un RNC inválido, 400', async () => {
      const { service } = build();
      expect(await service.suggest('130991873')).toMatchObject({ count: 0, expenseType: null, paymentMethod: null, supplierName: null });
      await expect(service.suggest('123')).rejects.toThrow('RNC inválido');
    });
  });

  it('findByExpense devuelve la factura que originó el gasto', async () => {
    const { service } = build();
    const inv = await service.create(dto({ projectId: null }), 'u');
    expect((await service.findByExpense('exp-1')).id).toBe(inv.id);
    await expect(service.findByExpense('otro')).rejects.toThrow('no viene de una factura');
  });
});

describe('FiscalInvoicesService — vincular a un gasto ya registrado (ERP-50)', () => {
  const MANUAL = '22222222-2222-4222-8222-222222222222';

  it('al crear con expenseId no crea otro gasto: vincula el que ya existía y no lo pisa', async () => {
    const { service, expenses, store } = build({ manualExpenses: [MANUAL] });
    const inv = await service.create(dto({ expenseId: MANUAL }), 'user-1');
    expect(expenses.create).not.toHaveBeenCalled();
    expect(expenses.update).not.toHaveBeenCalled();
    expect(inv.expenseId).toBe(MANUAL);
    expect(store.get(inv.id).expenseOwned).toBe(false);
  });

  it('con syncExpense le pone al gasto los datos de la factura', async () => {
    const { service, expenses } = build({ manualExpenses: [MANUAL] });
    await service.create(dto({ expenseId: MANUAL, syncExpense: true }), 'user-1');
    const [id, payload] = expenses.update.mock.calls[0] as any[];
    expect(id).toBe(MANUAL);
    expect(payload).toMatchObject({ amount: 1180, date: '2026-10-05', description: 'FERRETERIA UNO SRL — B0100000012' });
    expect('projectId' in payload).toBe(false);
  });

  it('no deja elegir a la vez un destino nuevo y un gasto existente', async () => {
    const { service } = build({ manualExpenses: [MANUAL] });
    await expect(service.create(dto({ expenseId: MANUAL, projectId: PROJECT }), 'user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('si el gasto no existe, la factura tampoco queda', async () => {
    const { service, store } = build();
    await expect(service.create(dto({ expenseId: MANUAL }), 'user-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(store.size).toBe(0);
  });

  it('un gasto ya enlazado a otra factura no se puede vincular otra vez', async () => {
    const { service, store } = build({ manualExpenses: [MANUAL] });
    await service.create(dto({ expenseId: MANUAL }), 'user-1');
    await expect(
      service.create(dto({ ncf: 'B0100000013', expenseId: MANUAL }), 'user-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(store.size).toBe(1); // la segunda factura no quedó a medias
  });

  it('editar la factura NO toca los datos del gasto vinculado', async () => {
    const { service, expenses } = build({ manualExpenses: [MANUAL] });
    const inv = await service.create(dto({ expenseId: MANUAL }), 'user-1');
    await service.update(inv.id, { baseAmount: 5000 } as any, 'user-1');
    expect(expenses.update).not.toHaveBeenCalled();
  });

  it('cambiar el proyecto de la factura vinculada solo cambia el proyecto del gasto', async () => {
    const { service, expenses } = build({ manualExpenses: [MANUAL] });
    const inv = await service.create(dto({ expenseId: MANUAL }), 'user-1');
    await service.update(inv.id, { projectId: PROJECT } as any, 'user-1');
    expect(expenses.update).toHaveBeenCalledWith(MANUAL, { projectId: PROJECT });
  });

  it('borrar la factura vinculada conserva el gasto que ya existía', async () => {
    const { service, expenses } = build({ manualExpenses: [MANUAL] });
    const inv = await service.create(dto({ expenseId: MANUAL }), 'user-1');
    await service.remove(inv.id, 'user-1');
    expect(expenses.remove).not.toHaveBeenCalled();
  });

  it('borrar una factura que creó su propio gasto sigue borrando ese gasto', async () => {
    const { service, expenses } = build();
    const inv = await service.create(dto({ projectId: null }), 'user-1');
    await service.remove(inv.id, 'user-1');
    expect(expenses.remove).toHaveBeenCalledWith('exp-1', 'user-1');
  });

  it('vincular una factura que ya guardada sin gasto, y luego desvincularla sin borrar el gasto', async () => {
    const { service, expenses, store } = build({ manualExpenses: [MANUAL] });
    const inv = await service.create(dto(), 'user-1');
    await service.linkExpense(inv.id, MANUAL, 'user-1');
    expect(store.get(inv.id)).toMatchObject({ expenseId: MANUAL, expenseOwned: false });

    await service.unlinkExpense(inv.id, 'user-1');
    expect(store.get(inv.id)).toMatchObject({ expenseId: null, expenseOwned: true });
    expect(expenses.remove).not.toHaveBeenCalled();
  });

  it('vincular una factura que ya tiene gasto es un conflicto', async () => {
    const { service } = build({ manualExpenses: [MANUAL] });
    const inv = await service.create(dto({ projectId: null }), 'user-1');
    await expect(service.linkExpense(inv.id, MANUAL, 'user-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('desvincular una factura sin gasto es un conflicto', async () => {
    const { service } = build();
    const inv = await service.create(dto(), 'user-1');
    await expect(service.unlinkExpense(inv.id, 'user-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('applyLinks informa las que fallan sin frenar las demás', async () => {
    const { service } = build({ manualExpenses: [MANUAL] });
    const a = await service.create(dto(), 'user-1');
    const b = await service.create(dto({ ncf: 'B0100000013' }), 'user-1');
    const r = await service.applyLinks(
      [
        { invoiceId: a.id, expenseId: MANUAL },
        { invoiceId: b.id, expenseId: MANUAL }, // el mismo gasto ya quedó enlazado a la primera
      ] as any,
      'user-1',
    );
    expect(r.linked).toBe(1);
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0].invoiceId).toBe(b.id);
  });
});
