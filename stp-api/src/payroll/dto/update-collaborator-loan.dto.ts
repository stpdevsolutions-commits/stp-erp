import { IsNumber, IsOptional, IsString, IsEnum, Min } from 'class-validator';
import { CollaboratorLoanStatus } from '../entities/collaborator-loan.entity';

// `amount` y `balance` no son editables a mano: el monto es fijo desde que se
// crea el préstamo, y el saldo lo mueve únicamente PayrollService al generar
// o borrar pagos de nómina (ver PayrollService.create/remove).
export class UpdateCollaboratorLoanDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  installmentAmount?: number;

  @IsOptional()
  @IsEnum(CollaboratorLoanStatus)
  status?: CollaboratorLoanStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
