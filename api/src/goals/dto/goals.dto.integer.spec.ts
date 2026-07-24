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

describe('Goals DTO integer gates', () => {
  describe('CreateGoalDto', () => {
    it('rejects fractional amountTotalKobo and monthlyIncomeKobo', async () => {
      const amount = await validationErrors(CreateGoalDto, {
        name: 'School fees',
        amountTotalKobo: 100.5,
        dueDate: '2026-12-01',
      });
      const income = await validationErrors(CreateGoalDto, {
        name: 'School fees',
        amountTotalKobo: 1000,
        dueDate: '2026-12-01',
        monthlyIncomeKobo: 50.25,
      });

      expect(amount.some((e) => e.property === 'amountTotalKobo')).toBe(true);
      expect(income.some((e) => e.property === 'monthlyIncomeKobo')).toBe(true);
    });
  });

  describe('UpdateGoalDto', () => {
    it('rejects fractional amountTotalKobo and monthlyIncomeKobo', async () => {
      const amount = await validationErrors(UpdateGoalDto, {
        amountTotalKobo: 99.9,
      });
      const income = await validationErrors(UpdateGoalDto, {
        monthlyIncomeKobo: 10.1,
      });

      expect(amount.some((e) => e.property === 'amountTotalKobo')).toBe(true);
      expect(income.some((e) => e.property === 'monthlyIncomeKobo')).toBe(true);
    });
  });
});
