import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import type { CreateTransactionRequest } from '../../contracts/generated/types.gen';

export class CreateTransactionDto implements CreateTransactionRequest {
  @IsIn(['in', 'out'])
  direction!: 'in' | 'out';

  @IsInt()
  @Min(1)
  amountKobo!: number;

  @IsDateString()
  occurredAt!: string;

  @IsOptional()
  @Type(() => String)
  @IsString()
  goalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;
}
