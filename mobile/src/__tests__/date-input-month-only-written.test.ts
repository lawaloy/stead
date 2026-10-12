import {
  buildCreateGoalPayload,
  goalFormValidationError,
} from '../lib/goal-form';
import { dateInputToIso } from '../lib/transactions';

describe('month-only written date inputs', () => {
  it.each(['September 2026', 'Sep 2026', 'SEPTEMBER 2026'])(
    'rejects %s instead of mapping a month-only written date onto the 1st',
    (value) => {
      expect(dateInputToIso(value)).toBeNull();
    },
  );

  it('rejects a month-only written goal due date instead of guessing the calendar day', () => {
    const validFields = {
      name: 'Rent',
      amountNaira: '1,200,000',
      dueOn: '2026-12-31',
      monthlyIncomeNaira: '300,000',
    };

    expect(
      goalFormValidationError({
        ...validFields,
        dueOn: 'September 2026',
      }),
    ).toBe('Enter a valid due date as YYYY-MM-DD');
    expect(
      buildCreateGoalPayload({
        ...validFields,
        dueOn: 'September 2026',
      }),
    ).toBeNull();
  });
});
