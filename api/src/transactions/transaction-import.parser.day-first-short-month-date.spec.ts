import { parseTransactionImport } from './transaction-import.parser';

const DAY_FIRST_SHORT_MONTH_DATES = [
  '1 Sep 2026',
  '01 Sep 2026',
  '1 Sep, 2026',
] as const;

describe('parseTransactionImport day-first short-month date cells', () => {
  it.each(DAY_FIRST_SHORT_MONTH_DATES)(
    'rejects canonical %s instead of mapping a day-first month abbreviation onto YYYY-MM-DD',
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

  it.each(DAY_FIRST_SHORT_MONTH_DATES)(
    'rejects provisional %s instead of adapting a day-first short-month date',
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
