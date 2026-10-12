import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport trailing currency suffixes', () => {
  it.each(['2500.50NGN', '2500.50 NGN', '1250₦', '₦1250NGN'] as const)(
    'rejects %s instead of stripping a trailing currency marker',
    (amount) => {
      const [row] = parseTransactionImport(
        [
          'date,description,amount,type',
          `2026-09-01,Transfer,${amount},income`,
        ].join('\n'),
      );

      expect(row.amountKobo).toBeNull();
      expect(row.fingerprint).toBeNull();
      expect(row.error).toContain('Amount must be a positive naira value');
    },
  );
});
