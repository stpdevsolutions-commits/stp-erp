import { Type } from 'class-transformer';
import {
  IsDefined,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PushKeysDto {
  @IsString()
  @MinLength(10)
  @MaxLength(255)
  p256dh: string;

  @IsString()
  @MinLength(10)
  @MaxLength(255)
  auth: string;
}

/** Cuerpo de `PushSubscription.toJSON()` del navegador. */
export class SubscribeDto {
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true })
  @MaxLength(2048)
  endpoint: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;
}

export class UnsubscribeDto {
  @IsString()
  @MaxLength(2048)
  endpoint: string;
}
