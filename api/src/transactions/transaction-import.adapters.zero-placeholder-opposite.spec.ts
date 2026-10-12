import { parseTransactionImport } from './transaction-import.parser';

describe('provisional unused-column placeholders with an opposite amount', () => {
  it.each([
    ['0', '5000'],
    ['0.00', '5000'],
    ['NGN 0', '5000'],
    ['-', '5000'],
  ] as const)(
    'treats debit %s with credit %s as both-filled instead of importing the credit',
    (debit, credit) => {
      const [row] = parseTransactionImport(
        [
          'date,narration,debit,credit',
          `2026-09-01,Salary,${debit},${credit}`,
        ].join('\n'),
      );

      expect(row.direction).toBeNull();
      expect(row.amountKobo).toBeNull();
      expect(row.fingerprint).toBeNull();
      expect(row.error).toContain(
        'Type must be income, expense, credit, or debit',
      );
      expect(row.error).toContain('Amount must be a positive naira value');
    },
  );

  it.each([
    ['5000', '0'],
    ['5000', '0.00'],
    ['5000', 'NGN 0'],
    ['5000', '-'],
  ] as const)(
    'treats debit %s with credit %s as both-filled instead of importing the debit',
    (debit, credit) => {
      const [row] = parseTransactionImport(
        [
          'date,narration,debit,credit',
          `2026-09-01,Transfer,${debit},${credit}`,
        ].join('\n'),
      );

      expect(row.direction).toBeNull();
      expect(row.amountKobo).toBeNull();
      expect(row.fingerprint).toBeNull();
      expect(row.error).toContain(
        'Type must be income, expense, credit, or debit',
      );
      expect(row.error).toContain('Amount must be a positive naira value');
    },
  );
});
