import { DataSource, DataSourceOptions } from 'typeorm';
import { QuotesService } from './quotes.service';
import { Quote } from './entities/quote.entity';
import { QuoteItem } from './entities/quote-item.entity';
import { Client } from '../clients/entities/client.entity';
import { AppDataSource } from '../data-source';

/**
 * ERP-79: GET /quotes?limit=N devolvía menos filas y un `total` incorrecto con límites
 * pequeños. Causa: el listado unía `quote.items` (uno-a-muchos) y paginaba con skip/take;
 * TypeORM aplica el LIMIT sobre las filas unidas (cotización x partida), así que una sola
 * cotización con muchas partidas se comía toda la página.
 */

describe('QuotesService.findAll: forma de la consulta (ERP-79)', () => {
  function setup(rows: Array<{ id: string }>) {
    const joins: string[] = [];
    const orders: string[] = [];
    const qb: Record<string, jest.Mock> = {};
    for (const m of ['orderBy', 'addOrderBy', 'skip', 'take', 'andWhere', 'clone', 'select', 'addSelect', 'groupBy']) {
      qb[m] = jest.fn(() => qb);
    }
    qb.leftJoinAndSelect = jest.fn((rel: string) => {
      joins.push(rel);
      return qb;
    });
    qb.addOrderBy = jest.fn((col: string) => {
      orders.push(col);
      return qb;
    });
    qb.getManyAndCount = jest.fn(async () => [rows.map((r) => ({ ...r })), 4]);
    qb.getRawMany = jest.fn(async () => []);
    const repo = {
      createQueryBuilder: jest.fn(() => qb),
      find: jest.fn(async () => [...rows].reverse().map((r) => ({ id: r.id, items: [{ id: `i-${r.id}` }] }))),
    };
    const svc = Object.create(QuotesService.prototype) as QuotesService;
    Object.assign(svc, { quotesRepository: repo, access: { applyScope: jest.fn(async (q: unknown) => q) } });
    return { svc, repo, joins, orders, qb };
  }

  it('la consulta paginada NO une items ni ordena por columnas de items', async () => {
    const { svc, joins, orders } = setup([{ id: 'a' }]);
    await svc.findAll({ limit: 1, page: 1 } as never);
    expect(joins).not.toContain('quote.items');
    expect(orders.some((o) => o.startsWith('items.'))).toBe(false);
  });

  it('carga las partidas aparte, en el orden de la página, sin duplicar', async () => {
    const { svc, repo } = setup([{ id: 'a' }, { id: 'b' }]);
    const r = await svc.findAll({ limit: 2, page: 1 } as never);
    expect(repo.find).toHaveBeenCalledTimes(1);
    expect(r.data.map((q) => q.id)).toEqual(['a', 'b']);
    expect(r.data[0].items).toEqual([{ id: 'i-a' }]);
    expect(r.total).toBe(4);
  });

  it('página vacía: no consulta partidas', async () => {
    const { svc, repo } = setup([]);
    const r = await svc.findAll({ limit: 5, page: 9 } as never);
    expect(repo.find).not.toHaveBeenCalled();
    expect(r.data).toEqual([]);
  });
});

// Prueba contra Postgres REAL, opt-in: TEST_PG_URL=postgres://user:pass@host:port/db (BD desechable).
const PG = process.env.TEST_PG_URL;
(PG ? describe : describe.skip)('QuotesService.findAll con Postgres real (ERP-79)', () => {
  let ds: DataSource;
  let svc: QuotesService;
  const ITEMS = [38, 3, 1, 5]; // una cotización con 38 partidas, como en producción

  beforeAll(async () => {
    ds = new DataSource({
      ...(AppDataSource.options as DataSourceOptions),
      url: PG,
      synchronize: true,
      dropSchema: true,
      migrations: [],
    } as DataSourceOptions);
    await ds.initialize();
    const client = await ds.getRepository(Client).save({ name: 'Cliente ERP-79' } as Client);
    for (let i = 0; i < ITEMS.length; i++) {
      const q = await ds.getRepository(Quote).save({
        number: `COT-79-${i}`,
        baseNumber: `COT-79-${i}`,
        title: `Cotización ${i}`,
        clientId: client.id,
      } as Quote);
      const items = Array.from({ length: ITEMS[i] }, (_, k) => ({
        quoteId: q.id,
        description: `p${k}`,
        quantity: 1,
        unitPrice: 1,
        total: 1,
        // orden inverso al de inserción para comprobar que se ordena por sortOrder
        sortOrder: ITEMS[i] - k,
      }));
      await ds.getRepository(QuoteItem).save(items as QuoteItem[]);
    }
    svc = Object.create(QuotesService.prototype) as QuotesService;
    Object.assign(svc, {
      quotesRepository: ds.getRepository(Quote),
      access: { applyScope: async (qb: unknown) => qb },
    });
  }, 60000);

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
  });

  it.each([1, 2, 3, 4, 5, 6, 10, 20, 100])('limit=%i: n=min(limit,4) y total=4', async (limit) => {
    const r = await svc.findAll({ limit, page: 1 } as never);
    expect(r.total).toBe(4);
    expect(r.data).toHaveLength(Math.min(limit, 4));
  });

  it('sin duplicados, partidas completas y ordenadas por sortOrder', async () => {
    const r = await svc.findAll({ limit: 100, page: 1, sort: 'number', dir: 'asc' } as never);
    expect(new Set(r.data.map((q) => q.id)).size).toBe(4);
    r.data.forEach((q, i) => {
      expect(q.items).toHaveLength(ITEMS[i]);
      const orden = q.items.map((it) => it.sortOrder);
      expect(orden).toEqual([...orden].sort((a, b) => a - b));
      expect(q.client?.name).toBe('Cliente ERP-79');
    });
  });

  it('paginar de a 1 recorre las 4 cotizaciones sin repetir ni saltar, en el mismo orden', async () => {
    const todas = (await svc.findAll({ limit: 100, page: 1, sort: 'number', dir: 'asc' } as never)).data.map((q) => q.id);
    const porPagina: string[] = [];
    for (let p = 1; p <= 4; p++) {
      const r = await svc.findAll({ limit: 1, page: p, sort: 'number', dir: 'asc' } as never);
      expect(r.total).toBe(4);
      expect(r.data).toHaveLength(1);
      porPagina.push(r.data[0].id);
    }
    expect(porPagina).toEqual(todas);
  });
});
