import { IsDateString, IsOptional } from 'class-validator';
import type { ListTransactionsData } from '../../contracts/generated/types.gen';

export class ListTransactionsQueryDto implements NonNullable<
  ListTransactionsData['query']
> {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
