import { formatTransactionDate } from '../lib/transactions';

describe('formatTransactionDate', () => {
  it('formats the UTC calendar day so a late-evening stamp does not roll forward', () => {
    expect(formatTransactionDate('2026-08-21T23:30:00.000Z')).toBe(
      '21 Aug 2026',
    );
    expect(formatTransactionDate('2026-08-21T00:30:00.000Z')).toBe(
      '21 Aug 2026',
    );
  });
});
