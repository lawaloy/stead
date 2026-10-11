import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ConfirmTransactionImportDto,
  PreviewTransactionImportDto,
} from './transaction-import.dto';

async function validationErrors(
  Dto: new () => object,
  payload: Record<string, unknown>,
) {
  return validate(
    plainToInstance(Dto, payload, { enableImplicitConversion: true }),
  );
}

describe('transaction import DTO goalId', () => {
  it('accepts omitted goalId on preview and confirm', async () => {
    await expect(
      validationErrors(PreviewTransactionImportDto, { csv: 'x' }),
    ).resolves.toHaveLength(0);
    await expect(
      validationErrors(ConfirmTransactionImportDto, {
        csv: 'x',
        rowNumbers: [2],
      }),
    ).resolves.toHaveLength(0);
  });

  it('rejects an empty-string goalId instead of treating it as unlinked', async () => {
    const preview = await validationErrors(PreviewTransactionImportDto, {
      csv: 'x',
      goalId: '',
    });
    const confirm = await validationErrors(ConfirmTransactionImportDto, {
      csv: 'x',
      rowNumbers: [2],
      goalId: '',
    });

    expect(preview.some((error) => error.property === 'goalId')).toBe(true);
    expect(confirm.some((error) => error.property === 'goalId')).toBe(true);
  });
});
