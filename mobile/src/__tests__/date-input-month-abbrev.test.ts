import {
  buildCreateGoalPayload,
  goalFormValidationError,
} from '../lib/goal-form';
import { dateInputToIso } from '../lib/transactions';

describe('month-abbreviation date inputs', () => {
  it.each(['01-Sep-2026', '1-Sep-2026', '01-SEP-2026'])(
    'rejects %s instead of mapping a month name onto YYYY-MM-DD',
    (value) => {
      expect(dateInputToIso(value)).toBeNull();
    },
  );

  it('rejects a month-abbreviation goal due date instead of guessing the calendar day', () => {
    const validFields = {
      name: 'Rent',
      amountNaira: '1,200,000',
      dueOn: '2026-12-31',
      monthlyIncomeNaira: '300,000',
    };

    expect(
      goalFormValidationError({ ...validFields, dueOn: '01-Sep-2026' }),
    ).toBe('Enter a valid due date as YYYY-MM-DD');
    expect(
      buildCreateGoalPayload({ ...validFields, dueOn: '01-Sep-2026' }),
    ).toBeNull();
  });
});
