import { parseTransactionImport } from './transaction-import.parser';

const MONTH_ONLY_WRITTEN_DATES = [
  'September 2026',
  'Sep 2026',
  'SEPTEMBER 2026',
] as const;

describe('parseTransactionImport month-only written date cells', () => {
  it.each(MONTH_ONLY_WRITTEN_DATES)(
    'rejects canonical %s instead of mapping a month-only written date onto the 1st',
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

  it.each(MONTH_ONLY_WRITTEN_DATES)(
    'rejects provisional %s instead of adapting a month-only written date',
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
