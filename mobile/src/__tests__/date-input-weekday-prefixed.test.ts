import {
  buildCreateGoalPayload,
  goalFormValidationError,
} from '../lib/goal-form';
import { dateInputToIso } from '../lib/transactions';

describe('weekday-prefixed date inputs', () => {
  it.each(['Mon, 2026-09-01', 'Monday 2026-09-01', 'Tue, 2026-09-01'])(
    'rejects %s instead of extracting YYYY-MM-DD from a weekday wrapper',
    (value) => {
      expect(dateInputToIso(value)).toBeNull();
    },
  );

  it('rejects a weekday-prefixed goal due date instead of guessing the calendar day', () => {
    const validFields = {
      name: 'Rent',
      amountNaira: '1,200,000',
      dueOn: '2026-12-31',
      monthlyIncomeNaira: '300,000',
    };

    expect(
      goalFormValidationError({ ...validFields, dueOn: 'Mon, 2026-09-01' }),
    ).toBe('Enter a valid due date as YYYY-MM-DD');
    expect(
      buildCreateGoalPayload({ ...validFields, dueOn: 'Mon, 2026-09-01' }),
    ).toBeNull();
  });
});
