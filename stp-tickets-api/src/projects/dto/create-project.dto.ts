import { IsString, MinLength, Matches } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(2)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug solo minúsculas, números y guiones' })
  slug: string;

  @IsString()
  @MinLength(2)
  name: string;
}
