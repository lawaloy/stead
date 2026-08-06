import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import type { CreateGoalRequest } from '../../contracts/generated/types.gen';

export class CreateGoalDto implements CreateGoalRequest {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsInt()
  @Min(1)
  amountTotalKobo!: number;

  @IsDateString()
  dueDate!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyIncomeKobo?: number;
}
