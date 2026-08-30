import {
  buildCreateGoalPayload,
  goalFormValidationError,
} from '../lib/goal-form';

const validFields = {
  name: '  Rent  ',
  amountKobo: '120000000',
  dueDate: '2026-12-31T00:00:00.000Z',
  monthlyIncomeKobo: '30000000',
};

describe('goal form helpers', () => {
  it('rejects blank names and non-positive kobo totals', () => {
    expect(
      goalFormValidationError({ ...validFields, name: '   ' }),
    ).toBe('Goal name is required');
    expect(
      goalFormValidationError({ ...validFields, amountKobo: '0' }),
    ).toBe('amountTotalKobo must be > 0');
    expect(
      goalFormValidationError({ ...validFields, amountKobo: '12.5' }),
    ).toBe('amountTotalKobo must be > 0');
    expect(
      goalFormValidationError({ ...validFields, amountKobo: '' }),
    ).toBe('amountTotalKobo must be > 0');
  });

  it('rejects unparseable due dates and invalid optional income', () => {
    expect(
      goalFormValidationError({ ...validFields, dueDate: '' }),
    ).toBe('dueDate must be a valid ISO date');
    expect(
      goalFormValidationError({ ...validFields, dueDate: 'next Friday' }),
    ).toBe('dueDate must be a valid ISO date');
    expect(
      goalFormValidationError({
        ...validFields,
        monthlyIncomeKobo: '-1',
      }),
    ).toBe('monthlyIncomeKobo must be >= 0');
    expect(
      goalFormValidationError({
        ...validFields,
        monthlyIncomeKobo: '50.25',
      }),
    ).toBe('monthlyIncomeKobo must be >= 0');
  });

  it('builds a trimmed create payload and omits blank monthly income', () => {
    expect(buildCreateGoalPayload(validFields)).toEqual({
      name: 'Rent',
      amountTotalKobo: 120_000_000,
      dueDate: '2026-12-31T00:00:00.000Z',
      monthlyIncomeKobo: 30_000_000,
    });
    expect(
      buildCreateGoalPayload({ ...validFields, monthlyIncomeKobo: '' }),
    ).toEqual({
      name: 'Rent',
      amountTotalKobo: 120_000_000,
      dueDate: '2026-12-31T00:00:00.000Z',
    });
    expect(buildCreateGoalPayload({ ...validFields, name: '' })).toBeNull();
  });
});
