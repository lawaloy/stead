import {
  buildCreateGoalPayload,
  buildUpdateGoalPayload,
  goalFormValidationError,
  goalToFormFields,
} from '../lib/goal-form';

const validFields = {
  name: '  Rent  ',
  amountNaira: '1,200,000',
  dueOn: '2026-12-31',
  monthlyIncomeNaira: '300000',
};

describe('goal form helpers', () => {
  it('rejects blank names and invalid naira totals', () => {
    expect(goalFormValidationError({ ...validFields, name: '   ' })).toBe(
      'Goal name is required',
    );
    for (const amountNaira of ['0', '-1', '12.345', '']) {
      expect(goalFormValidationError({ ...validFields, amountNaira })).toBe(
        'Enter a goal amount greater than zero',
      );
    }
  });

  it('rejects invalid calendar dates and optional income', () => {
    for (const dueOn of ['', 'next Friday', '2026-02-30']) {
      expect(goalFormValidationError({ ...validFields, dueOn })).toBe(
        'Enter a valid due date as YYYY-MM-DD',
      );
    }
    for (const monthlyIncomeNaira of ['-1', '50.251']) {
      expect(
        goalFormValidationError({ ...validFields, monthlyIncomeNaira }),
      ).toBe('Enter a valid monthly income or leave it blank');
    }
  });

  it('builds create and update payloads in kobo with stable date-only semantics', () => {
    const expected = {
      name: 'Rent',
      amountTotalKobo: 120_000_000,
      dueDate: '2026-12-31T12:00:00.000Z',
      monthlyIncomeKobo: 30_000_000,
    };
    expect(buildCreateGoalPayload(validFields)).toEqual(expected);
    expect(buildUpdateGoalPayload(validFields)).toEqual(expected);
  });

  it('omits blank income on create, clears it on update, and preserves zero', () => {
    expect(
      buildCreateGoalPayload({ ...validFields, monthlyIncomeNaira: '' }),
    ).not.toHaveProperty('monthlyIncomeKobo');
    expect(
      buildUpdateGoalPayload({ ...validFields, monthlyIncomeNaira: '' }),
    ).toMatchObject({ monthlyIncomeKobo: null });
    expect(
      buildUpdateGoalPayload({ ...validFields, monthlyIncomeNaira: '0' }),
    ).toMatchObject({ monthlyIncomeKobo: 0 });
  });

  it('maps an API goal back into editable customer-friendly fields', () => {
    expect(
      goalToFormFields({
        id: 'goal_1',
        userId: 'user_1',
        name: 'Rent',
        amountTotalKobo: 120_000_050,
        dueDate: '2026-12-31T12:00:00.000Z',
        monthlyIncomeKobo: null,
        isActive: true,
        status: 'active',
        endedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toEqual({
      name: 'Rent',
      amountNaira: '1200000.50',
      dueOn: '2026-12-31',
      monthlyIncomeNaira: '',
    });
  });
});
