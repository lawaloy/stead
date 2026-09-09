import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { UpdateAccountProfileRequest } from '../../contracts/generated/types.gen';

export class UpdateProfileDto implements UpdateAccountProfileRequest {
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName?: string | null;
}
