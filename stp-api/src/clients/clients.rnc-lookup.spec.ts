import { BadRequestException } from '@nestjs/common';
import { ClientsController } from './clients.controller';
import { REQUIRE_MODULE_KEY } from '../common/decorators/require-module.decorator';

/** GET /clients/rnc-lookup/:rnc con el servicio de la DGII simulado (nunca se llama a la DGII real). */
function setup() {
  const dgii = { lookupRnc: jest.fn(async (rnc: string) => ({ found: true, rnc, name: 'EMPRESA X' })) };
  const ctrl = new ClientsController({} as never, {} as never, dgii as never);
  return { ctrl, dgii };
}

describe('ClientsController.lookupRnc (GET /clients/rnc-lookup/:rnc)', () => {
  it('normaliza el RNC (guiones, espacios) antes de consultar', async () => {
    const { ctrl, dgii } = setup();
    const r = await ctrl.lookupRnc('101-09916-1');
    expect(dgii.lookupRnc).toHaveBeenCalledWith('101099161');
    expect(r).toEqual({ found: true, rnc: '101099161', name: 'EMPRESA X' });
    await ctrl.lookupRnc(' 101 099 161 ');
    expect(dgii.lookupRnc).toHaveBeenLastCalledWith('101099161');
  });

  it('acepta cédula de 11 dígitos', async () => {
    const { ctrl, dgii } = setup();
    await ctrl.lookupRnc('001-1234567-8');
    expect(dgii.lookupRnc).toHaveBeenCalledWith('00112345678');
  });

  it.each([['12345678'], ['1234567890'], ['123456789012'], ['abcdefghi'], ['---'], [''], ['   ']])(
    'rechaza "%s": solo 9 u 11 dígitos tras normalizar (400, sin consultar)',
    async (raw) => {
      const { ctrl, dgii } = setup();
      await expect(ctrl.lookupRnc(raw)).rejects.toBeInstanceOf(BadRequestException);
      await expect(ctrl.lookupRnc(raw)).rejects.toThrow('RNC inválido: 9 dígitos (11 si es cédula)');
      expect(dgii.lookupRnc).not.toHaveBeenCalled();
    },
  );

  it('propaga el 503 de la DGII tal cual', async () => {
    const { ctrl, dgii } = setup();
    const err = new Error('503');
    dgii.lookupRnc.mockRejectedValueOnce(err);
    await expect(ctrl.lookupRnc('101099161')).rejects.toBe(err);
  });

  it('exige el permiso clientes:manage', () => {
    const meta = Reflect.getMetadata(REQUIRE_MODULE_KEY, ClientsController.prototype.lookupRnc);
    expect(meta).toEqual({ module: 'clientes', level: 'manage' });
  });
});
