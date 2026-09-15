import { IsOptional, IsString, IsEnum, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { clampPage, clampLimit } from '../../common/pagination';
import { ClientType } from '../entities/client.entity';

export class QueryClientsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ClientType)
  type?: ClientType;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(({ value }) => clampPage(value))
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => clampLimit(value))
  limit?: number = 20;
}
