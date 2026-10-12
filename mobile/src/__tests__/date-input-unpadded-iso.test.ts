import {
  buildCreateGoalPayload,
  goalFormValidationError,
} from '../lib/goal-form';
import { dateInputToIso } from '../lib/transactions';

describe('unpadded ISO date inputs', () => {
  it.each(['2026-9-1', '2026-09-1', '2026-9-01'])(
    'rejects %s instead of padding it to a calendar day',
    (value) => {
      expect(dateInputToIso(value)).toBeNull();
    },
  );

  it('rejects an unpadded goal due date instead of guessing the calendar day', () => {
    const validFields = {
      name: 'Rent',
      amountNaira: '1,200,000',
      dueOn: '2026-12-31',
      monthlyIncomeNaira: '300,000',
    };

    expect(goalFormValidationError({ ...validFields, dueOn: '2026-9-1' })).toBe(
      'Enter a valid due date as YYYY-MM-DD',
    );
    expect(
      buildCreateGoalPayload({ ...validFields, dueOn: '2026-9-1' }),
    ).toBeNull();
  });
});
