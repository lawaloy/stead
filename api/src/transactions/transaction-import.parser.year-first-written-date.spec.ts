import { parseTransactionImport } from './transaction-import.parser';

const YEAR_FIRST_WRITTEN_DATES = [
  '2026 September 1',
  '2026 September 01',
  '2026 Sep 01',
] as const;

describe('parseTransactionImport year-first written date cells', () => {
  it.each(YEAR_FIRST_WRITTEN_DATES)(
    'rejects canonical %s instead of mapping a year-first month name onto YYYY-MM-DD',
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

  it.each(YEAR_FIRST_WRITTEN_DATES)(
    'rejects provisional %s instead of adapting a year-first written date',
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
