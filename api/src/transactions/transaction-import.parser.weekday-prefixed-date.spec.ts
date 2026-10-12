import { parseTransactionImport } from './transaction-import.parser';

const WEEKDAY_PREFIXED_DATES = [
  'Mon, 2026-09-01',
  'Monday 2026-09-01',
  'Tue, 2026-09-01',
] as const;

describe('parseTransactionImport weekday-prefixed date cells', () => {
  it.each(WEEKDAY_PREFIXED_DATES)(
    'rejects canonical %s instead of extracting YYYY-MM-DD from a weekday wrapper',
    (dateCell) => {
      const [row] = parseTransactionImport(
        [
          'date,description,amount,type',
          `"${dateCell}",Salary,2500.50,income`,
        ].join('\n'),
      );

      expect(row.occurredAt).toBeNull();
      expect(row.fingerprint).toBeNull();
      expect(row.error).toContain('Date must use YYYY-MM-DD');
    },
  );

  it.each(WEEKDAY_PREFIXED_DATES)(
    'rejects provisional %s instead of stripping a weekday and adapting the date',
    (dateCell) => {
      const [row] = parseTransactionImport(
        [
          'Value Date,Particulars,Debit,Credit',
          `"${dateCell}",Salary,,"2500.50"`,
        ].join('\n'),
      );

      expect(row.occurredAt).toBeNull();
      expect(row.fingerprint).toBeNull();
      expect(row.error).toContain('Date must use YYYY-MM-DD');
    },
  );
});
