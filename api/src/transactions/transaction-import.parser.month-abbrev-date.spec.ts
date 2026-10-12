import { parseTransactionImport } from './transaction-import.parser';

const MONTH_ABBREV_DATES = [
  '01-Sep-2026',
  '1-Sep-2026',
  '01-SEP-2026',
] as const;

describe('parseTransactionImport month-abbreviation date cells', () => {
  it.each(MONTH_ABBREV_DATES)(
    'rejects canonical %s instead of mapping a month name onto YYYY-MM-DD',
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

  it.each(MONTH_ABBREV_DATES)(
    'rejects provisional %s instead of adapting a dash-separated month abbreviation',
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
