import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConfirmTransactionImportDto } from './transaction-import.dto';

async function validationErrors(payload: Record<string, unknown>) {
  const instance = plainToInstance(ConfirmTransactionImportDto, payload, {
    enableImplicitConversion: true,
  });
  return validate(instance);
}

describe('ConfirmTransactionImportDto bounds', () => {
  it('rejects more than 500 selected rows', async () => {
    const errors = await validationErrors({
      csv: 'x',
      rowNumbers: Array.from({ length: 501 }, (_, index) => index + 2),
    });
    expect(errors.some((error) => error.property === 'rowNumbers')).toBe(true);
  });

  it('rejects fractional, negative, and zero row numbers', async () => {
    const fractional = await validationErrors({
      csv: 'x',
      rowNumbers: [2.5],
    });
    const negative = await validationErrors({
      csv: 'x',
      rowNumbers: [-2],
    });
    const zero = await validationErrors({
      csv: 'x',
      rowNumbers: [0],
    });

    expect(fractional.some((error) => error.property === 'rowNumbers')).toBe(
      true,
    );
    expect(negative.some((error) => error.property === 'rowNumbers')).toBe(
      true,
    );
    expect(zero.some((error) => error.property === 'rowNumbers')).toBe(true);
  });

  it('accepts the maximum allowed unique integer selection', async () => {
    const errors = await validationErrors({
      csv: 'x',
      rowNumbers: Array.from({ length: 500 }, (_, index) => index + 2),
    });
    expect(errors).toHaveLength(0);
  });
});
