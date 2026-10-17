import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BadRequestException } from '@nestjs/common';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

// ERP-80: validación de la ubicación GPS del proyecto (rangos en el DTO, "ambas o ninguna" en el servicio).
const BASE = { name: 'Proyecto de prueba', clientId: '3f0f6f1e-8c1e-4e0b-9a77-6a1f3f7f2b11' };

async function errorsOf(body: Record<string, unknown>, cls: new () => object = CreateProjectDto) {
  const errs = await validate(plainToInstance(cls, body));
  return errs.map((e) => e.property);
}

describe('Proyecto: ubicación (DTO)', () => {
  it('acepta coordenadas válidas y nota', async () => {
    expect(
      await errorsOf({ ...BASE, latitude: 18.486058, longitude: -69.931212, locationNote: 'Frente al colmado' }),
    ).toEqual([]);
  });

  it('acepta null para quitar la ubicación en la actualización', async () => {
    expect(await errorsOf({ latitude: null, longitude: null, locationNote: null }, UpdateProjectDto)).toEqual([]);
  });

  it('rechaza latitud fuera de -90..90 y longitud fuera de -180..180', async () => {
    expect(await errorsOf({ ...BASE, latitude: 91, longitude: 0 })).toContain('latitude');
    expect(await errorsOf({ ...BASE, latitude: -90.5, longitude: 0 })).toContain('latitude');
    expect(await errorsOf({ ...BASE, latitude: 0, longitude: 180.1 })).toContain('longitude');
    expect(await errorsOf({ ...BASE, latitude: 0, longitude: -181 })).toContain('longitude');
  });

  it('rechaza valores no numéricos o con más de 6 decimales', async () => {
    expect(await errorsOf({ ...BASE, latitude: 'abc', longitude: 0 })).toContain('latitude');
    expect(await errorsOf({ ...BASE, latitude: 18.1234567, longitude: 0 })).toContain('latitude');
  });
});

describe('Proyecto: ubicación (servicio, ambas o ninguna)', () => {
  const svc = new ProjectsService(null as never, null as never, null as never, null as never, null as never);
  const check = (lat?: number | null, lon?: number | null) =>
    (svc as unknown as { assertCoords(a?: number | null, b?: number | null): void }).assertCoords(lat, lon);

  it('permite ambas, ninguna (null/undefined) y el cero válido', () => {
    expect(() => check(18.4, -69.9)).not.toThrow();
    expect(() => check(null, null)).not.toThrow();
    expect(() => check(undefined, undefined)).not.toThrow();
    expect(() => check(0, 0)).not.toThrow();
  });

  it('rechaza una sola coordenada', () => {
    expect(() => check(18.4, null)).toThrow(BadRequestException);
    expect(() => check(undefined, -69.9)).toThrow(BadRequestException);
  });
});
