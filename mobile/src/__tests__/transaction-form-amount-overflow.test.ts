import { buildTransactionUpdatePayload } from '../lib/transactions';

describe('transaction update amount overflow', () => {
  it('rejects an edit amount that overflows safe integer kobo', () => {
    expect(
      buildTransactionUpdatePayload({
        direction: 'in',
        amountNaira: '90071992547410',
        occurredOn: '2026-08-21',
        note: 'overflow',
        tagGoal: false,
        goalSelectionChanged: false,
        currentGoalId: null,
      }),
    ).toBeNull();
  });
});
