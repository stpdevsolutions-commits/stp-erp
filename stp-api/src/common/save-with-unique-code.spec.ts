import { ConflictException } from '@nestjs/common';
import {
  isUniqueViolation,
  retryOnUniqueViolation,
  saveWithUniqueCode,
} from './save-with-unique-code';

const uniqueError = () => Object.assign(new Error('duplicate key'), { code: '23505' });

describe('isUniqueViolation', () => {
  it('reconoce 23505 directo o dentro de driverError', () => {
    expect(isUniqueViolation(uniqueError())).toBe(true);
    expect(isUniqueViolation({ driverError: { code: '23505' } })).toBe(true);
  });
  it('no confunde otros errores', () => {
    expect(isUniqueViolation(new Error('x'))).toBe(false);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe('saveWithUniqueCode', () => {
  it('recalcula el código y reintenta cuando el UNIQUE falla dos veces', async () => {
    let next = 5;
    const generate = jest.fn(async () => `PRJ-2026-${String(next++).padStart(3, '0')}`);
    const save = jest
      .fn<Promise<string>, [string]>()
      .mockRejectedValueOnce(uniqueError())
      .mockRejectedValueOnce(uniqueError())
      .mockImplementation(async (code) => code);

    await expect(saveWithUniqueCode(generate, save)).resolves.toBe('PRJ-2026-007');
    expect(generate).toHaveBeenCalledTimes(3);
    expect(save.mock.calls.map((c) => c[0])).toEqual([
      'PRJ-2026-005',
      'PRJ-2026-006',
      'PRJ-2026-007',
    ]);
  });

  it('lanza 409 si agota los intentos', async () => {
    const save = jest.fn().mockRejectedValue(uniqueError());
    await expect(
      saveWithUniqueCode(async () => 'X', save, { attempts: 3, label: 'el proyecto' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(save).toHaveBeenCalledTimes(3);
  });

  it('no reintenta errores que no son de unicidad', async () => {
    const boom = new Error('conexión caída');
    const save = jest.fn().mockRejectedValue(boom);
    await expect(saveWithUniqueCode(async () => 'X', save)).rejects.toBe(boom);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe('retryOnUniqueViolation', () => {
  it('devuelve el resultado a la primera si no hay choque', async () => {
    const op = jest.fn().mockResolvedValue('ok');
    await expect(retryOnUniqueViolation(op)).resolves.toBe('ok');
    expect(op).toHaveBeenCalledTimes(1);
  });
});
