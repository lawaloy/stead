import {
  buildCreateGoalPayload,
  goalFormValidationError,
} from '../lib/goal-form';
import { dateInputToIso } from '../lib/transactions';

describe('dotted date inputs', () => {
  it.each(['01.09.2026', '1.9.2026', '01.09.2026 00:00:00'])(
    'rejects %s instead of treating dots as a calendar delimiter',
    (value) => {
      expect(dateInputToIso(value)).toBeNull();
    },
  );

  it('rejects a dotted goal due date instead of guessing the calendar day', () => {
    const validFields = {
      name: 'Rent',
      amountNaira: '1,200,000',
      dueOn: '2026-12-31',
      monthlyIncomeNaira: '300,000',
    };

    expect(
      goalFormValidationError({ ...validFields, dueOn: '01.09.2026' }),
    ).toBe('Enter a valid due date as YYYY-MM-DD');
    expect(
      buildCreateGoalPayload({ ...validFields, dueOn: '01.09.2026' }),
    ).toBeNull();
  });
});
