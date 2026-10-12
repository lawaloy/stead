import { parseTransactionImport } from './transaction-import.parser';

const DASH_FULL_MONTH_DATES = [
  '01-September-2026',
  '1-September-2026',
  '01-SEPTEMBER-2026',
] as const;

describe('parseTransactionImport dash-separated full-month date cells', () => {
  it.each(DASH_FULL_MONTH_DATES)(
    'rejects canonical %s instead of mapping a dash-separated month name onto YYYY-MM-DD',
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

  it.each(DASH_FULL_MONTH_DATES)(
    'rejects provisional %s instead of adapting a dash-separated full month name',
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
