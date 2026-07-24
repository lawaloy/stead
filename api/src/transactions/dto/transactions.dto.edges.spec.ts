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

describe('Transactions DTO edges', () => {
  describe('CreateTransactionDto', () => {
    it('rejects fractional, negative, and missing amountKobo', async () => {
      const fractional = await validationErrors(CreateTransactionDto, {
        direction: 'in',
        amountKobo: 100.5,
        occurredAt: '2026-01-15T00:00:00.000Z',
      });
      const negative = await validationErrors(CreateTransactionDto, {
        direction: 'out',
        amountKobo: -1,
        occurredAt: '2026-01-15T00:00:00.000Z',
      });
      const missing = await validationErrors(CreateTransactionDto, {
        direction: 'in',
        occurredAt: '2026-01-15T00:00:00.000Z',
      });

      expect(fractional.some((e) => e.property === 'amountKobo')).toBe(true);
      expect(negative.some((e) => e.property === 'amountKobo')).toBe(true);
      expect(missing.some((e) => e.property === 'amountKobo')).toBe(true);
    });

    it('rejects non-ISO occurredAt', async () => {
      const errors = await validationErrors(CreateTransactionDto, {
        direction: 'in',
        amountKobo: 1000,
        occurredAt: '15/01/2026',
      });
      expect(errors.some((e) => e.property === 'occurredAt')).toBe(true);
    });
  });

  describe('UpdateTransactionDto', () => {
    it('rejects numeric goalId without create-path string coercion', async () => {
      const errors = await validationErrors(UpdateTransactionDto, {
        goalId: 123,
      });
      expect(errors.some((e) => e.property === 'goalId')).toBe(true);
    });

    it('rejects fractional amountKobo and oversized notes', async () => {
      const amount = await validationErrors(UpdateTransactionDto, {
        amountKobo: 12.25,
      });
      const note = await validationErrors(UpdateTransactionDto, {
        note: 'n'.repeat(281),
      });
      expect(amount.some((e) => e.property === 'amountKobo')).toBe(true);
      expect(note.some((e) => e.property === 'note')).toBe(true);
    });

    it('rejects non-ISO occurredAt on update', async () => {
      const errors = await validationErrors(UpdateTransactionDto, {
        occurredAt: 'yesterday',
      });
      expect(errors.some((e) => e.property === 'occurredAt')).toBe(true);
    });
  });

  describe('ListTransactionsQueryDto', () => {
    it('rejects malformed to date bounds', async () => {
      const errors = await validationErrors(ListTransactionsQueryDto, {
        to: 'not-a-date',
      });
      expect(errors.some((e) => e.property === 'to')).toBe(true);
    });
  });
});
