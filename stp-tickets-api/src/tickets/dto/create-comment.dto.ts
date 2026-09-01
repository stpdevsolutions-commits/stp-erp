import { IsString, IsOptional, MinLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  body: string;

  @IsOptional()
  @IsString()
  author?: string;
}
