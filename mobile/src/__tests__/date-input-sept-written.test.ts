import {
  buildCreateGoalPayload,
  goalFormValidationError,
} from '../lib/goal-form';
import { dateInputToIso } from '../lib/transactions';

describe('Sept written date inputs', () => {
  it.each(['Sept 1, 2026', 'Sept 01, 2026', 'Sept. 1, 2026'])(
    'rejects %s instead of mapping a 4-letter month abbreviation onto YYYY-MM-DD',
    (value) => {
      expect(dateInputToIso(value)).toBeNull();
    },
  );

  it('rejects a Sept written goal due date instead of guessing the calendar day', () => {
    const validFields = {
      name: 'Rent',
      amountNaira: '1,200,000',
      dueOn: '2026-12-31',
      monthlyIncomeNaira: '300,000',
    };

    expect(
      goalFormValidationError({ ...validFields, dueOn: 'Sept 1, 2026' }),
    ).toBe('Enter a valid due date as YYYY-MM-DD');
    expect(
      buildCreateGoalPayload({ ...validFields, dueOn: 'Sept 1, 2026' }),
    ).toBeNull();
  });
});
