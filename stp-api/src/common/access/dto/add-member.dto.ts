import { IsUUID } from 'class-validator';

export class AddMemberDto {
  /** Usuario a asignar. */
  @IsUUID()
  userId: string;
}
