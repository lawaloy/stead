import {
  buildCreateGoalPayload,
  goalFormValidationError,
} from '../lib/goal-form';
import { nairaInputToKobo } from '../lib/transactions';

describe('naira input CR/DR suffixes', () => {
  it.each(['2500.50CR', '2500.50 DR', '2500.50DR'])(
    'rejects %s instead of importing a truncated amount',
    (amount) => {
      expect(nairaInputToKobo(amount)).toBeNull();
    },
  );

  it('rejects CR/DR-suffixed goal amount and optional income instead of under-parsing', () => {
    const validFields = {
      name: 'Rent',
      amountNaira: '1,200,000',
      dueOn: '2026-12-31',
      monthlyIncomeNaira: '300,000',
    };

    expect(
      goalFormValidationError({ ...validFields, amountNaira: '1200CR' }),
    ).toBe('Enter a goal amount greater than zero');
    expect(
      buildCreateGoalPayload({ ...validFields, amountNaira: '1200CR' }),
    ).toBeNull();
    expect(
      goalFormValidationError({
        ...validFields,
        monthlyIncomeNaira: '300000 DR',
      }),
    ).toBe('Enter a valid monthly income or leave it blank');
    expect(
      buildCreateGoalPayload({
        ...validFields,
        monthlyIncomeNaira: '300000 DR',
      }),
    ).toBeNull();
  });
});
