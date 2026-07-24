import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTransactionDto } from './create-transaction.dto';
import { ListTransactionsQueryDto } from './list-transactions.dto';
import { UpdateTransactionDto } from './update-transaction.dto';

async function validationErrors(
  Dto: new () => object,
  payload: Record<string, unknown>,
) {
  const instance = plainToInstance(Dto, payload, {
    enableImplicitConversion: true,
  });
  return validate(instance);
}

describe('Transactions DTOs', () => {
  describe('CreateTransactionDto', () => {
    it('accepts in/out directions and coerces numeric goalId to string', async () => {
      const instance = plainToInstance(
        CreateTransactionDto,
        {
          direction: 'in',
          amountKobo: 1000,
          occurredAt: '2026-01-15T00:00:00.000Z',
          goalId: 123,
          note: 'deposit',
        },
        { enableImplicitConversion: true },
      );
      await expect(validate(instance)).resolves.toHaveLength(0);
      expect(instance.goalId).toBe('123');
    });

    it('rejects invalid direction and zero amount', async () => {
      const direction = await validationErrors(CreateTransactionDto, {
        direction: 'xfer',
        amountKobo: 1000,
        occurredAt: '2026-01-15T00:00:00.000Z',
      });
      const amount = await validationErrors(CreateTransactionDto, {
        direction: 'out',
        amountKobo: 0,
        occurredAt: '2026-01-15T00:00:00.000Z',
      });
      expect(direction.some((e) => e.property === 'direction')).toBe(true);
      expect(amount.some((e) => e.property === 'amountKobo')).toBe(true);
    });

    it('rejects notes longer than 280 characters', async () => {
      const errors = await validationErrors(CreateTransactionDto, {
        direction: 'in',
        amountKobo: 1000,
        occurredAt: '2026-01-15T00:00:00.000Z',
        note: 'n'.repeat(281),
      });
      expect(errors.some((e) => e.property === 'note')).toBe(true);
    });
  });

  describe('UpdateTransactionDto', () => {
    it('allows goalId null unlink without failing IsString', async () => {
      await expect(
        validationErrors(UpdateTransactionDto, {
          goalId: null,
          note: null,
        }),
      ).resolves.toHaveLength(0);
    });

    it('rejects invalid direction and zero amount on update', async () => {
      const direction = await validationErrors(UpdateTransactionDto, {
        direction: 'xfer',
      });
      const amount = await validationErrors(UpdateTransactionDto, {
        amountKobo: 0,
      });
      expect(direction.some((e) => e.property === 'direction')).toBe(true);
      expect(amount.some((e) => e.property === 'amountKobo')).toBe(true);
    });
  });

  describe('ListTransactionsQueryDto', () => {
    it('accepts optional ISO date bounds and rejects malformed dates', async () => {
      await expect(
        validationErrors(ListTransactionsQueryDto, {
          from: '2026-01-01',
          to: '2026-01-31',
        }),
      ).resolves.toHaveLength(0);

      const errors = await validationErrors(ListTransactionsQueryDto, {
        from: 'not-a-date',
      });
      expect(errors.some((e) => e.property === 'from')).toBe(true);
    });
  });
});
