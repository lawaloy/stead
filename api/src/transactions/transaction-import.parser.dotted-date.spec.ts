import { parseTransactionImport } from './transaction-import.parser';

const DOTTED_DATES = ['01.09.2026', '1.9.2026', '01.09.2026 00:00:00'] as const;

describe('parseTransactionImport dotted date cells', () => {
  it.each(DOTTED_DATES)(
    'rejects canonical %s instead of treating dots as a day/month delimiter',
    (dateCell) => {
      const [row] = parseTransactionImport(
        [
          'date,description,amount,type',
          `${dateCell},Salary,2500.50,income`,
        ].join('\n'),
      );

      expect(row.occurredAt).toBeNull();
      expect(row.fingerprint).toBeNull();
      expect(row.error).toContain('Date must use YYYY-MM-DD');
    },
  );

  it.each(DOTTED_DATES)(
    'rejects provisional %s instead of adapting dots as DD.MM.YYYY',
    (dateCell) => {
      const [row] = parseTransactionImport(
        [
          'Value Date,Particulars,Debit,Credit',
          `${dateCell},Salary,,"2500.50"`,
        ].join('\n'),
      );

      expect(row.occurredAt).toBeNull();
      expect(row.fingerprint).toBeNull();
      expect(row.error).toContain('Date must use YYYY-MM-DD');
    },
  );
});
