import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type {
  ConfirmTransactionImportRequest,
  PreviewTransactionImportRequest,
} from '../../contracts/generated/types.gen';

export class PreviewTransactionImportDto implements PreviewTransactionImportRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(200_000)
  csv!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  goalId?: string;
}

export class ConfirmTransactionImportDto implements ConfirmTransactionImportRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(200_000)
  csv!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(2, { each: true })
  rowNumbers!: number[];

  @IsOptional()
  @IsString()
  @MinLength(1)
  goalId?: string;
}
