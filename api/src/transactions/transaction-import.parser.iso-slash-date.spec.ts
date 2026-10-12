import { parseTransactionImport } from './transaction-import.parser';

const ISO_SLASH_DATES = ['2026/09/01', '2026/9/1'] as const;

describe('parseTransactionImport ISO-style slash dates', () => {
  it.each(ISO_SLASH_DATES)(
    'rejects canonical %s instead of treating year as a day/month',
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

  it.each(ISO_SLASH_DATES)(
    'rejects provisional %s instead of adapting it as DD/MM/YYYY',
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
