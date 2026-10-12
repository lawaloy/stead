import {
  buildCreateGoalPayload,
  goalFormValidationError,
} from '../lib/goal-form';
import { dateInputToIso } from '../lib/transactions';

describe('compact and year-first dotted date inputs', () => {
  it.each(['20260901', '20260131', '2026.09.01', '2026.9.1'])(
    'rejects %s instead of coercing it to a calendar day',
    (value) => {
      expect(dateInputToIso(value)).toBeNull();
    },
  );

  it('rejects a compact goal due date instead of inserting ISO dashes', () => {
    const validFields = {
      name: 'Rent',
      amountNaira: '1,200,000',
      dueOn: '2026-12-31',
      monthlyIncomeNaira: '300,000',
    };

    expect(goalFormValidationError({ ...validFields, dueOn: '20260901' })).toBe(
      'Enter a valid due date as YYYY-MM-DD',
    );
    expect(
      buildCreateGoalPayload({ ...validFields, dueOn: '20260901' }),
    ).toBeNull();
    expect(
      goalFormValidationError({ ...validFields, dueOn: '2026.09.01' }),
    ).toBe('Enter a valid due date as YYYY-MM-DD');
    expect(
      buildCreateGoalPayload({ ...validFields, dueOn: '2026.09.01' }),
    ).toBeNull();
  });
});
