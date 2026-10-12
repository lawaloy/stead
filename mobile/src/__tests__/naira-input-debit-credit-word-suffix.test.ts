import {
  buildCreateGoalPayload,
  goalFormValidationError,
} from '../lib/goal-form';
import { nairaInputToKobo } from '../lib/transactions';

describe('naira input debit/credit word suffixes', () => {
  it.each(['2500.50 debit', '1250 credit', '1,250.50 Debit'])(
    'rejects %s instead of stripping a trailing debit/credit word',
    (amount) => {
      expect(nairaInputToKobo(amount)).toBeNull();
    },
  );

  it('rejects debit/credit-word goal amount and optional income instead of importing the number', () => {
    const validFields = {
      name: 'Rent',
      amountNaira: '1,200,000',
      dueOn: '2026-12-31',
      monthlyIncomeNaira: '300,000',
    };

    expect(
      goalFormValidationError({ ...validFields, amountNaira: '1200 debit' }),
    ).toBe('Enter a goal amount greater than zero');
    expect(
      buildCreateGoalPayload({ ...validFields, amountNaira: '1200 debit' }),
    ).toBeNull();
    expect(
      goalFormValidationError({
        ...validFields,
        monthlyIncomeNaira: '300000 credit',
      }),
    ).toBe('Enter a valid monthly income or leave it blank');
    expect(
      buildCreateGoalPayload({
        ...validFields,
        monthlyIncomeNaira: '300000 credit',
      }),
    ).toBeNull();
  });
});
