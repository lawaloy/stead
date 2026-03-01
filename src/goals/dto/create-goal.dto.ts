import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateGoalDto {
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
