import { IsDateString, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateTransactionDto {
  @IsOptional()
  @IsIn(['in', 'out'])
  direction?: 'in' | 'out';

  @IsOptional()
  @IsInt()
  @Min(1)
  amountKobo?: number;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  goalId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string | null;
}
