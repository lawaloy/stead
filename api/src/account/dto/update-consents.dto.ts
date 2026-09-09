import { IsBoolean, ValidateIf } from 'class-validator';
import type { UpdateAccountConsentsRequest } from '../../contracts/generated/types.gen';

export class UpdateConsentsDto implements UpdateAccountConsentsRequest {
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  analyticsEnabled?: boolean;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  productResearchEnabled?: boolean;
}
