import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport space-grouped amounts', () => {
  it.each(['1 000', '1 000.00', '10 000.50'])(
    'rejects space thousands grouping instead of importing %s as a smaller amount',
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
