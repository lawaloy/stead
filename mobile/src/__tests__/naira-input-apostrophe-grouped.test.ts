import {
  buildCreateGoalPayload,
  goalFormValidationError,
} from '../lib/goal-form';
import { nairaInputToKobo } from '../lib/transactions';

describe('naira input apostrophe thousands grouping', () => {
  it.each(["1'250.50", "1'250", "10'000.00"])(
    'rejects apostrophe grouping instead of importing %s as a smaller amount',
    (amount) => {
      expect(nairaInputToKobo(amount)).toBeNull();
    },
  );

  it('rejects apostrophe-grouped goal amount and optional income instead of under-parsing', () => {
    const validFields = {
      name: 'Rent',
      amountNaira: '1,200,000',
      dueOn: '2026-12-31',
      monthlyIncomeNaira: '300,000',
    };

    expect(
      goalFormValidationError({ ...validFields, amountNaira: "1'200'000" }),
    ).toBe('Enter a goal amount greater than zero');
    expect(
      buildCreateGoalPayload({ ...validFields, amountNaira: "1'200'000" }),
    ).toBeNull();
    expect(
      goalFormValidationError({
        ...validFields,
        monthlyIncomeNaira: "1'000.50",
      }),
    ).toBe('Enter a valid monthly income or leave it blank');
    expect(
      buildCreateGoalPayload({
        ...validFields,
        monthlyIncomeNaira: "1'000.50",
      }),
    ).toBeNull();
  });
});
