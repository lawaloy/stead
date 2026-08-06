import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import type { UpdateGoalRequest } from '../../contracts/generated/types.gen';

export class UpdateGoalDto implements UpdateGoalRequest {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  amountTotalKobo?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyIncomeKobo?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
