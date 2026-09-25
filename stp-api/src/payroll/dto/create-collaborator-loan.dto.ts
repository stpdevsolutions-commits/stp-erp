import { IsUUID, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateCollaboratorLoanDto {
  @IsUUID()
  collaboratorId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  installmentAmount: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
