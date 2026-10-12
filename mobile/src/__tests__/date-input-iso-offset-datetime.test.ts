import {
  buildCreateGoalPayload,
  goalFormValidationError,
} from '../lib/goal-form';
import { dateInputToIso } from '../lib/transactions';

describe('ISO offset datetime date inputs', () => {
  it.each([
    '2026-09-01T00:00:00+01:00',
    '2026-09-01T23:00:00-05:00',
    '2026-09-01T00:00:00.000+01:00',
  ])(
    'rejects %s instead of slicing or converting a timezone offset',
    (value) => {
      expect(dateInputToIso(value)).toBeNull();
    },
  );

  it('rejects an ISO offset goal due date instead of shifting the calendar day', () => {
    const validFields = {
      name: 'Rent',
      amountNaira: '1,200,000',
      dueOn: '2026-12-31',
      monthlyIncomeNaira: '300,000',
    };

    expect(
      goalFormValidationError({
        ...validFields,
        dueOn: '2026-09-01T23:00:00-05:00',
      }),
    ).toBe('Enter a valid due date as YYYY-MM-DD');
    expect(
      buildCreateGoalPayload({
        ...validFields,
        dueOn: '2026-09-01T23:00:00-05:00',
      }),
    ).toBeNull();
  });
});
