import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateGoalDto } from './create-goal.dto';
import { UpdateGoalDto } from './update-goal.dto';

async function validationErrors(
  Dto: new () => object,
  payload: Record<string, unknown>,
) {
  const instance = plainToInstance(Dto, payload, {
    enableImplicitConversion: true,
  });
  return validate(instance);
}

describe('Goals DTOs', () => {
  describe('CreateGoalDto', () => {
    it('accepts a valid create payload including zero monthly income', async () => {
      await expect(
        validationErrors(CreateGoalDto, {
          name: 'School fees',
          amountTotalKobo: 500_000,
          dueDate: '2026-12-01',
          monthlyIncomeKobo: 0,
        }),
      ).resolves.toHaveLength(0);
    });

    it('rejects zero or negative goal totals', async () => {
      const zero = await validationErrors(CreateGoalDto, {
        name: 'School fees',
        amountTotalKobo: 0,
        dueDate: '2026-12-01',
      });
      const negative = await validationErrors(CreateGoalDto, {
        name: 'School fees',
        amountTotalKobo: -1,
        dueDate: '2026-12-01',
      });
      expect(zero.some((e) => e.property === 'amountTotalKobo')).toBe(true);
      expect(negative.some((e) => e.property === 'amountTotalKobo')).toBe(true);
    });

    it('rejects negative monthly income and oversized names', async () => {
      const income = await validationErrors(CreateGoalDto, {
        name: 'School fees',
        amountTotalKobo: 1000,
        dueDate: '2026-12-01',
        monthlyIncomeKobo: -1,
      });
      const name = await validationErrors(CreateGoalDto, {
        name: 'x'.repeat(101),
        amountTotalKobo: 1000,
        dueDate: '2026-12-01',
      });
      expect(income.some((e) => e.property === 'monthlyIncomeKobo')).toBe(true);
      expect(name.some((e) => e.property === 'name')).toBe(true);
    });
  });

  describe('UpdateGoalDto', () => {
    it('accepts partial updates including zero income and isActive', async () => {
      await expect(
        validationErrors(UpdateGoalDto, {
          monthlyIncomeKobo: 0,
          isActive: true,
        }),
      ).resolves.toHaveLength(0);
    });

    it('rejects zero amountTotalKobo on update', async () => {
      const errors = await validationErrors(UpdateGoalDto, {
        amountTotalKobo: 0,
      });
      expect(errors.some((e) => e.property === 'amountTotalKobo')).toBe(true);
    });
  });
});
