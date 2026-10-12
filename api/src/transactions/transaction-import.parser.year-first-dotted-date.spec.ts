import { parseTransactionImport } from './transaction-import.parser';

const YEAR_FIRST_DOTTED_DATES = ['2026.09.01', '2026.9.1'] as const;

describe('parseTransactionImport year-first dotted date cells', () => {
  it.each(YEAR_FIRST_DOTTED_DATES)(
    'rejects canonical %s instead of treating dots as an ISO year-month-day delimiter',
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

  it.each(YEAR_FIRST_DOTTED_DATES)(
    'rejects provisional %s instead of adapting dots as YYYY.MM.DD',
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
