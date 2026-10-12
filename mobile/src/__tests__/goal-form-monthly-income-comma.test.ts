import {
  buildCreateGoalPayload,
  buildUpdateGoalPayload,
  goalFormValidationError,
} from '../lib/goal-form';

const validFields = {
  name: 'Rent',
  amountNaira: '1,200,000',
  dueOn: '2026-12-31',
  monthlyIncomeNaira: '300,000',
};

describe('goal form comma-grouped monthly income', () => {
  it('accepts thousands separators in optional income and converts them to kobo', () => {
    expect(goalFormValidationError(validFields)).toBe('');
    expect(buildCreateGoalPayload(validFields)).toEqual({
      name: 'Rent',
      amountTotalKobo: 120_000_000,
      dueDate: '2026-12-31T12:00:00.000Z',
      monthlyIncomeKobo: 30_000_000,
    });
    expect(
      buildCreateGoalPayload({
        ...validFields,
        monthlyIncomeNaira: '1,200,000.50',
      }),
    ).toMatchObject({ monthlyIncomeKobo: 120_000_050 });
    expect(
      buildUpdateGoalPayload({
        ...validFields,
        monthlyIncomeNaira: ' 300,000.5 ',
      }),
    ).toMatchObject({ monthlyIncomeKobo: 30_000_050 });
  });
});
