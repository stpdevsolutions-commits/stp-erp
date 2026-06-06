import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FileContext } from '../entities/file-upload.entity';

export class QueryFilesDto {
  @ApiPropertyOptional({ enum: FileContext })
  @IsOptional()
  @IsEnum(FileContext)
  context?: FileContext;
}
