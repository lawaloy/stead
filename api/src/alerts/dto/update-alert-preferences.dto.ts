import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { UpdateAlertPreferencesRequest } from '../../contracts/generated/types.gen';

export class UpdateAlertPreferencesDto implements UpdateAlertPreferencesRequest {
  @IsOptional()
  @IsBoolean()
  weeklySummaryEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  riskAlertsEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  timeZone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  weeklyDay?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  weeklyHourLocal?: number;
}
