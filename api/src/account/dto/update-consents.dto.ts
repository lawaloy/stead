import { IsBoolean, IsOptional } from 'class-validator';
import type { UpdateAccountConsentsRequest } from '../../contracts/generated/types.gen';

export class UpdateConsentsDto implements UpdateAccountConsentsRequest {
  @IsOptional()
  @IsBoolean()
  analyticsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  productResearchEnabled?: boolean;
}
