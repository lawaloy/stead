import {
  buildCreateGoalPayload,
  goalFormValidationError,
} from '../lib/goal-form';
import { nairaInputToKobo } from '../lib/transactions';

describe('naira input Excel formulas', () => {
  it.each(['=2500.50', '=1250', '=1,250.50'])(
    'rejects %s instead of evaluating a leading Excel formula',
    (amount) => {
      expect(nairaInputToKobo(amount)).toBeNull();
    },
  );

  it('rejects formula goal amount and optional income instead of evaluating the cell', () => {
    const validFields = {
      name: 'Rent',
      amountNaira: '1,200,000',
      dueOn: '2026-12-31',
      monthlyIncomeNaira: '300,000',
    };

    expect(
      goalFormValidationError({ ...validFields, amountNaira: '=1200' }),
    ).toBe('Enter a goal amount greater than zero');
    expect(
      buildCreateGoalPayload({ ...validFields, amountNaira: '=1200' }),
    ).toBeNull();
    expect(
      goalFormValidationError({
        ...validFields,
        monthlyIncomeNaira: '=300000',
      }),
    ).toBe('Enter a valid monthly income or leave it blank');
    expect(
      buildCreateGoalPayload({
        ...validFields,
        monthlyIncomeNaira: '=300000',
      }),
    ).toBeNull();
  });
});
