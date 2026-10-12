import {
  buildCreateGoalPayload,
  goalFormValidationError,
} from '../lib/goal-form';
import { dateInputToIso } from '../lib/transactions';

describe('day-first full-month date inputs', () => {
  it.each(['1 September 2026', '01 September 2026', '1 September, 2026'])(
    'rejects %s instead of mapping a day-first month name onto YYYY-MM-DD',
    (value) => {
      expect(dateInputToIso(value)).toBeNull();
    },
  );

  it('rejects a day-first full-month goal due date instead of guessing the calendar day', () => {
    const validFields = {
      name: 'Rent',
      amountNaira: '1,200,000',
      dueOn: '2026-12-31',
      monthlyIncomeNaira: '300,000',
    };

    expect(
      goalFormValidationError({
        ...validFields,
        dueOn: '1 September 2026',
      }),
    ).toBe('Enter a valid due date as YYYY-MM-DD');
    expect(
      buildCreateGoalPayload({
        ...validFields,
        dueOn: '1 September 2026',
      }),
    ).toBeNull();
  });
});
