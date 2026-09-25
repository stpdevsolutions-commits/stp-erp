import { IsString, IsOptional, IsEnum, IsNumber, IsBoolean, IsUUID, Min, ValidateIf } from 'class-validator';
import { InventoryCategory, InventoryLocationStatus } from '../entities/inventory-item.entity';

export class UpdateInventoryItemDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsEnum(InventoryCategory)
  category?: InventoryCategory;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsEnum(InventoryLocationStatus)
  locationStatus?: InventoryLocationStatus;

  @ValidateIf((dto) => dto.locationStatus === InventoryLocationStatus.LOANED)
  @IsString()
  loanedToName?: string;

  @ValidateIf((dto) => dto.locationStatus === InventoryLocationStatus.ASSIGNED)
  @IsUUID()
  assignedProjectId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
