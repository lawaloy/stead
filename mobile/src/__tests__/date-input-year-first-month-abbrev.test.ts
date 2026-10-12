import {
  buildCreateGoalPayload,
  goalFormValidationError,
} from '../lib/goal-form';
import { dateInputToIso } from '../lib/transactions';

describe('year-first month-abbreviation date inputs', () => {
  it.each(['2026-Sep-01', '2026-SEP-01', '2026-Sep-1'])(
    'rejects %s instead of mapping a year-first month name onto YYYY-MM-DD',
    (value) => {
      expect(dateInputToIso(value)).toBeNull();
    },
  );

  it('rejects a year-first month-abbreviation goal due date instead of guessing the calendar day', () => {
    const validFields = {
      name: 'Rent',
      amountNaira: '1,200,000',
      dueOn: '2026-12-31',
      monthlyIncomeNaira: '300,000',
    };

    expect(
      goalFormValidationError({ ...validFields, dueOn: '2026-Sep-01' }),
    ).toBe('Enter a valid due date as YYYY-MM-DD');
    expect(
      buildCreateGoalPayload({ ...validFields, dueOn: '2026-Sep-01' }),
    ).toBeNull();
  });
});
