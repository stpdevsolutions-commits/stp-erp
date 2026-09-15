import { IsString, MaxLength } from 'class-validator';

export class UpdateTermsDto {
  @IsString()
  @MaxLength(20000)
  terms: string;
}
