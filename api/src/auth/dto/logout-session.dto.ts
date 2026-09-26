import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import type { LogoutSessionRequest } from '../../contracts/generated/types.gen';

export class LogoutSessionDto implements LogoutSessionRequest {
  @IsOptional()
  @IsString()
  @MinLength(1)
  refreshToken?: string;

  @IsOptional()
  @IsBoolean()
  allDevices?: boolean;
}
