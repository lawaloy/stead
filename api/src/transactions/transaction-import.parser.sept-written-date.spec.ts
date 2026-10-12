import { parseTransactionImport } from './transaction-import.parser';

const SEPT_WRITTEN_DATES = [
  'Sept 1, 2026',
  'Sept 01, 2026',
  'Sept. 1, 2026',
] as const;

describe('parseTransactionImport Sept written date cells', () => {
  it.each(SEPT_WRITTEN_DATES)(
    'rejects canonical %s instead of mapping a 4-letter month abbreviation onto YYYY-MM-DD',
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

  it.each(SEPT_WRITTEN_DATES)(
    'rejects provisional %s instead of adapting a Sept written month-name date',
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
