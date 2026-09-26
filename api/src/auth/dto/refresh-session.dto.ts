import { IsString, MinLength } from 'class-validator';
import type { RefreshSessionRequest } from '../../contracts/generated/types.gen';

export class RefreshSessionDto implements RefreshSessionRequest {
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}
