import {
  buildCreateGoalPayload,
  buildUpdateGoalPayload,
  goalFormValidationError,
} from '../lib/goal-form';

const validFields = {
  name: '  Rent  ',
  amountNaira: '1,200,000',
  dueOn: '2026-12-31',
  monthlyIncomeNaira: '300000',
};

describe('goal form goal-amount overflow', () => {
  it('rejects a primary goal amount that overflows safe integer kobo', () => {
    const overflowing = {
      ...validFields,
      amountNaira: '90071992547410',
    };

    expect(goalFormValidationError(overflowing)).toBe(
      'Enter a goal amount greater than zero',
    );
    expect(buildCreateGoalPayload(overflowing)).toBeNull();
    expect(buildUpdateGoalPayload(overflowing)).toBeNull();
  });
});
