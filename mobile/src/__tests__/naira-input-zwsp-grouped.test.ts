import {
  buildCreateGoalPayload,
  goalFormValidationError,
} from '../lib/goal-form';
import { nairaInputToKobo } from '../lib/transactions';

describe('naira input zwsp thousands grouping', () => {
  it.each(['1\u200b250.50', '1\u200b250', '10\u200b000.50'])(
    'rejects zero-width space grouping instead of importing %s as a smaller amount',
    (amount) => {
      expect(nairaInputToKobo(amount)).toBeNull();
    },
  );

  it('rejects zwsp-grouped goal amount and optional income instead of under-parsing', () => {
    const validFields = {
      name: 'Rent',
      amountNaira: '1,200,000',
      dueOn: '2026-12-31',
      monthlyIncomeNaira: '300,000',
    };

    expect(
      goalFormValidationError({
        ...validFields,
        amountNaira: '1\u200b200\u200b000',
      }),
    ).toBe('Enter a goal amount greater than zero');
    expect(
      buildCreateGoalPayload({
        ...validFields,
        amountNaira: '1\u200b200\u200b000',
      }),
    ).toBeNull();
    expect(
      goalFormValidationError({
        ...validFields,
        monthlyIncomeNaira: '1\u200b000.50',
      }),
    ).toBe('Enter a valid monthly income or leave it blank');
    expect(
      buildCreateGoalPayload({
        ...validFields,
        monthlyIncomeNaira: '1\u200b000.50',
      }),
    ).toBeNull();
  });
});
